"""FAISS vector indexes, persisted to disk under ``FAISS_ROOT``.

Replaces Chroma Cloud. One index file per collection:

    /data/faiss/lexvert.faiss        + lexvert.meta.json
    /data/faiss/lexvert_user.faiss   + lexvert_user.meta.json

Three properties the rest of the stack relies on:

* **Ids are ours.** Every index is an ``IndexIDMap2``, so a vector is addressed
  by the ``embedding_id`` SQLite allocated rather than by its insertion position.
  That is what makes deletion safe: FAISS compacts on ``remove_ids``, which would
  renumber positional ids and silently repoint every later chunk.
* **Filtering happens by id.** FAISS has no metadata, so a scoped search (one
  advocate's corpus) resolves its allow-list in SQLite and passes it down as an
  ``IDSelectorBatch``. Getting this wrong leaks one user's documents to another,
  so ``search`` refuses an empty allow-list rather than falling back to
  searching everything.
* **The index is a cache of SQLite.** Chunk text lives in the database, so a
  lost or truncated index can always be rebuilt (``rag/scripts/rebuild_index.py``)
  by re-embedding. That is why a delayed flush is survivable.
"""

from __future__ import annotations

import fcntl
import json
import logging
import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np

logger = logging.getLogger("ravenslaw.rag.faiss")

# ─── One index, one id space ─────────────────────────────────────────────────
#
# There is a single physical FAISS index. Vectors are never duplicated and there
# is no per-user index: a thousand tenants with a hundred documents each would
# otherwise mean a thousand index files, a thousand file handles, and a thousand
# separately-trained coarse quantizers over samples far too small to train on.
#
# Tenancy is enforced entirely through the id space, which is partitioned:
#
#     [PUBLIC_ID_MIN, PRIVATE_ID_MIN)   the public legal corpus
#     [PRIVATE_ID_MIN, 2**63)           private, owner-scoped documents
#
# The partition is what makes "search the whole public corpus" expressible as an
# ``IDSelectorRange`` -- an O(1) bounds check per candidate -- instead of an
# allow-list. That distinction is not cosmetic: at 10^8 public chunks the
# materialised list would be 800MB per query, so a design that filters public
# search by enumeration does not reach production scale at all.
#
# Private access stays an explicit ``IDSelectorBatch`` of the owner's ids, which
# is small by construction and is the only shape that can express "these exact
# rows and nothing else".
PUBLIC_ID_MIN = 1
PRIVATE_ID_MIN = 1 << 62

# The single physical index every vector lives in.
GLOBAL_COLLECTION = "owllex"

# Logical partitions, still stored in SQLite's `collection` column and still
# used by callers to say which corpus a document belongs to. Both now resolve to
# the one index above; the names are kept so existing callers, scripts and
# dashboards keep working.
PUBLIC_COLLECTION = "lexvert"
USER_COLLECTION = "lexvert_user"
COLLECTIONS = (GLOBAL_COLLECTION,)
LOGICAL_COLLECTIONS = (PUBLIC_COLLECTION, USER_COLLECTION)


def is_public_id(faiss_id: int) -> bool:
    """True when an id belongs to the public corpus partition."""
    return PUBLIC_ID_MIN <= faiss_id < PRIVATE_ID_MIN


@dataclass(frozen=True)
class SearchFilter:
    """Which vectors a search is allowed to see.

    Deliberately not expressible as "no filter by default". Every search states
    its scope, and the one way to search unrestricted is to say so out loud --
    so an unscoped search is a thing you can grep for rather than the accidental
    result of a ``None`` arriving where a list was expected.
    """

    allowed_ids: Sequence[int] | None = None
    """Explicit allow-list, from SQLite. An **empty list means zero results**:
    the filter matched nothing. It must never widen into an unfiltered search --
    see :meth:`VectorIndex.search`."""

    include_public: bool = False
    """OR the whole public id range into the filter, without materialising it."""

    unrestricted: bool = False
    """Search every vector, public and private, for every tenant. Only for
    offline tooling -- never reachable from a request path."""

    @classmethod
    def public(cls) -> "SearchFilter":
        """The public legal corpus, which every authenticated user may search."""
        return cls(include_public=True)

    @classmethod
    def owned_by(cls, allowed_ids: Sequence[int], include_public: bool = False) -> "SearchFilter":
        """Exactly these ids, optionally alongside the public corpus."""
        return cls(allowed_ids=allowed_ids, include_public=include_public)

    @classmethod
    def everything(cls) -> "SearchFilter":
        """No restriction at all. Offline rebuild/diagnostic use only."""
        return cls(unrestricted=True)

    @property
    def matches_nothing(self) -> bool:
        """The allow-list was resolved and came back empty."""
        return (
            not self.unrestricted
            and not self.include_public
            and self.allowed_ids is not None
            and len(self.allowed_ids) == 0
        )


@dataclass(frozen=True)
class SearchHit:
    """One neighbour: which vector, and how close."""

    embedding_id: int
    score: float

    @property
    def faiss_id(self) -> int:
        """Preferred name. ``embedding_id`` is the older spelling of the same id."""
        return self.embedding_id


class VectorIndex:
    """A single persisted FAISS index.

    Not constructed directly in application code -- :class:`VectorIndexRegistry`
    owns one per collection and is what gets injected.
    """

    def __init__(
        self,
        collection: str,
        path: Path,
        dimension: int,
        signature: str,
        index_factory: str = "Flat",
        flush_every: int = 1,
    ) -> None:
        self.collection = collection
        self.path = Path(path)
        self.meta_path = self.path.with_suffix(".meta.json")
        self.dimension = dimension
        self.signature = signature
        self.index_factory = index_factory
        self._flush_every = max(1, flush_every)
        self._index = None
        self._unflushed = 0
        self._lock = threading.RLock()
        # True when the in-memory index holds something `flush()` has not yet
        # written -- either pending adds/removes, or a brand-new index that
        # has no file on disk at all. A process that only ever loads and
        # searches an existing file leaves this False for its whole life, so
        # its flush()/close() is a no-op that never touches the file or
        # contends for the write lock below.
        self._dirty = False
        # Cross-process write lock, separate from `_lock` above (which is only
        # ever contended within one process). Acquired lazily by the first
        # add/remove/flush -- see `_acquire_write_lock`.
        self.lock_path = self.path.with_suffix(".lock")
        self._lock_file = None

    # ─── Lifecycle ───────────────────────────────────────────────────────────

    def load(self) -> "VectorIndex":
        """Load the index from disk, or create an empty one. Idempotent."""
        import faiss

        with self._lock:
            if self._index is not None:
                return self

            if self.path.exists():
                self._verify_meta()
                index = faiss.read_index(str(self.path))
                if index.d != self.dimension:
                    raise RuntimeError(
                        f"{self.path} was built with dimension {index.d}, but EMBED_DIM is "
                        f"{self.dimension}. Re-embed the corpus or restore the matching index."
                    )
                logger.info(
                    "Loaded FAISS index %s (%d vectors, dim %d)",
                    self.collection, index.ntotal, index.d,
                )
            else:
                index = self._new_index()
                # Nothing on disk yet to represent this. A pure reader that
                # never adds anything should not go on to create an empty
                # file (or contend for the write lock) just because it
                # happened to be first to look.
                self._dirty = True
                logger.info("Created empty FAISS index %s (dim %d)", self.collection, self.dimension)

            self._index = index
            return self

    def _new_index(self):
        import faiss

        # Inner product over unit-length vectors == cosine similarity. The
        # embedder normalises, so nothing here needs to.
        base = faiss.index_factory(self.dimension, self.index_factory, faiss.METRIC_INNER_PRODUCT)
        return faiss.IndexIDMap2(base)

    def _verify_meta(self) -> None:
        """Refuse to load an index built by a different model or dimension.

        Vectors from two embedding models are not comparable, and mixing them
        does not error -- it just returns confidently wrong neighbours. This is
        the only place that mismatch can still be caught cheaply.
        """
        if not self.meta_path.exists():
            logger.warning(
                "%s has no sidecar metadata; cannot verify it matches the configured "
                "embedding model (%s)", self.path.name, self.signature,
            )
            return
        try:
            meta = json.loads(self.meta_path.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Unreadable index metadata %s: %s", self.meta_path, exc)
            return

        stored = meta.get("signature")
        if stored and stored != self.signature:
            raise RuntimeError(
                f"FAISS index {self.path.name} was built with embeddings '{stored}' but this "
                f"process is configured for '{self.signature}'. Re-embed the corpus "
                f"(rag/scripts/rebuild_index.py) or restore the matching index."
            )

    @property
    def index(self):
        if self._index is None:
            raise RuntimeError(f"Index {self.collection} is not loaded -- call load() at startup")
        return self._index

    @property
    def ntotal(self) -> int:
        return int(self.index.ntotal) if self._index is not None else 0

    @property
    def is_loaded(self) -> bool:
        return self._index is not None

    # ─── Writes ──────────────────────────────────────────────────────────────

    def _acquire_write_lock(self) -> None:
        """Exclusive, non-blocking OS lock, held for this instance's lifetime.

        Belt-and-braces alongside the T2 enqueue model making the ingest
        worker the sole caller of add/remove/flush in normal operation: a
        second process attempting to write the same index -- a stray inline
        write, a concurrent rebuild, two ingest workers -- fails immediately on
        its first write instead of silently clobbering whichever one flushes
        last. Acquired lazily (not in `load()`) so a read-only process, like
        the API serving search, never contends for it at all.
        """
        if self._lock_file is not None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        handle = open(self.lock_path, "w")
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            handle.close()
            raise RuntimeError(
                f"Another process already holds the write lock for FAISS index "
                f"'{self.collection}' ({self.lock_path}). Only one process may write "
                f"it at a time -- stop the other writer (e.g. `systemctl stop "
                f"owllex-ingest`) before running this."
            ) from None
        self._lock_file = handle

    def add(self, embedding_ids: Sequence[int], vectors: np.ndarray) -> None:
        """Insert vectors incrementally under caller-supplied ids."""
        if len(embedding_ids) == 0:
            return
        vectors = self._as_matrix(vectors)
        if vectors.shape[0] != len(embedding_ids):
            raise ValueError("embedding_ids and vectors must have the same length")

        with self._lock:
            self._acquire_write_lock()
            index = self.index
            if not index.is_trained:
                self._train(vectors)
            index.add_with_ids(vectors, np.asarray(embedding_ids, dtype=np.int64))
            self._unflushed += len(embedding_ids)
            self._maybe_flush()

    def remove(self, embedding_ids: Sequence[int]) -> int:
        """Drop vectors by id. Returns how many were actually removed."""
        if not embedding_ids:
            return 0
        import faiss

        with self._lock:
            self._acquire_write_lock()
            selector = faiss.IDSelectorBatch(np.asarray(embedding_ids, dtype=np.int64))
            removed = int(self.index.remove_ids(selector))
            if removed:
                self._unflushed += removed
                self._maybe_flush()
            return removed

    def _train(self, vectors: np.ndarray) -> None:
        """Train a non-flat factory (IVF/PQ) before its first insert.

        Deliberately not buffered: silently holding vectors back until enough
        arrive would make them unsearchable, and invisible in the index count,
        with nothing in the logs to explain it. An operator building a compressed
        index trains it explicitly from the corpus (rag/scripts/rebuild_index.py).
        """
        needed = max(1, getattr(self.index.index, "nlist", 1))
        if vectors.shape[0] < needed:
            raise RuntimeError(
                f"FAISS index '{self.collection}' uses factory '{self.index_factory}', which must "
                f"be trained on at least {needed} vectors before the first insert, but this batch "
                f"has {vectors.shape[0]}. Build it in bulk with rag/scripts/rebuild_index.py, or "
                f"set FAISS_INDEX_FACTORY=Flat."
            )
        logger.info("Training %s on %d vectors", self.collection, vectors.shape[0])
        self.index.train(vectors)

    # ─── Reads ───────────────────────────────────────────────────────────────

    def search(
        self,
        query: np.ndarray,
        k: int,
        allowed_ids: Sequence[int] | None = None,
        *,
        scope: "SearchFilter | None" = None,
    ) -> list[SearchHit]:
        """Nearest neighbours within an explicitly stated scope.

        ``scope`` is the supported form. ``allowed_ids`` is the older positional
        spelling, kept so existing callers keep working; it means the same thing
        as ``SearchFilter(allowed_ids=...)``, with ``None`` meaning unrestricted.

        The security rule, stated once and enforced here:

            **An empty allow-list returns zero results.**

        It never falls back to searching the whole index. An empty list is not
        "no filter" -- it is the answer "this tenant owns nothing that matches",
        and widening it is exactly how one lawyer's privileged documents would be
        served to another. Any future refactor that introduces

            if not ids:
                return self._search_all(...)

        reintroduces that leak. The distinction between "not scoped yet" (None)
        and "scoped to nothing" ([]) is load-bearing, which is why
        :class:`SearchFilter` makes unrestricted search a field you have to set
        rather than a default you can reach by accident.
        """
        import faiss

        if scope is None:
            scope = (
                SearchFilter.everything()
                if allowed_ids is None
                else SearchFilter(allowed_ids=allowed_ids)
            )

        # THE security check. Do not replace with a fallback.
        if scope.matches_nothing:
            return []
        if k <= 0 or self.ntotal == 0:
            return []

        vector = self._as_matrix(query)
        if vector.shape[0] != 1:
            raise ValueError("search expects a single query vector")

        with self._lock:
            # `keepalive` holds every selector for the duration of the call:
            # SearchParameters only borrows them, and a composite selector only
            # borrows its operands, so letting SWIG collect one mid-search would
            # read freed memory.
            params, keepalive = self._build_params(faiss, scope)
            scores, ids = self.index.search(vector, min(k, self.ntotal), params=params)
            del keepalive

        # FAISS pads with -1 when it finds fewer than k neighbours.
        return [
            SearchHit(embedding_id=int(i), score=float(s))
            for i, s in zip(ids[0], scores[0])
            if i != -1
        ]

    @staticmethod
    def _build_params(faiss, scope: "SearchFilter"):
        """Turn a scope into FAISS search parameters plus the objects to keep alive."""
        if scope.unrestricted:
            return None, ()

        keepalive: list = []
        selectors = []

        if scope.include_public:
            # A range check, not a list: the public corpus is the large side and
            # must never be enumerated per query.
            public = faiss.IDSelectorRange(PUBLIC_ID_MIN, PRIVATE_ID_MIN)
            selectors.append(public)
            keepalive.append(public)

        if scope.allowed_ids:
            batch = faiss.IDSelectorBatch(np.asarray(scope.allowed_ids, dtype=np.int64))
            selectors.append(batch)
            keepalive.append(batch)

        if not selectors:
            # Unreachable: matches_nothing covers the empty-allow-list case and
            # unrestricted is handled above. Raising rather than defaulting to
            # "no filter" keeps the fail-safe direction pointing at "return
            # nothing" if a future branch ever misses a case.
            raise RuntimeError("SearchFilter produced no selector; refusing an unscoped search")

        selector = selectors[0]
        for extra in selectors[1:]:
            selector = faiss.IDSelectorOr(selector, extra)
            keepalive.append(selector)

        params = faiss.SearchParameters()
        params.sel = selector
        keepalive.append(params)
        return params, tuple(keepalive)

    def _as_matrix(self, vectors: np.ndarray) -> np.ndarray:
        matrix = np.asarray(vectors, dtype=np.float32)
        if matrix.ndim == 1:
            matrix = matrix.reshape(1, -1)
        if matrix.shape[1] != self.dimension:
            raise ValueError(
                f"Expected {self.dimension}-dimensional vectors, got {matrix.shape[1]}"
            )
        # FAISS requires C-contiguous float32.
        return np.ascontiguousarray(matrix)

    # ─── Persistence ─────────────────────────────────────────────────────────

    def _maybe_flush(self) -> None:
        if self._unflushed >= self._flush_every:
            self.flush()

    def flush(self) -> None:
        """Write the index to disk atomically, if there is anything to write.

        Written to a sibling temp file and renamed, so a crash mid-write leaves
        the previous good index in place rather than a truncated one. A no-op,
        touching neither the file nor the write lock, when nothing has
        changed in this process -- see the `_dirty` note in `__init__`.
        """
        import faiss

        with self._lock:
            if self._index is None or not (self._dirty or self._unflushed):
                return
            self._acquire_write_lock()
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path = self.path.with_suffix(".faiss.tmp")
            faiss.write_index(self._index, str(tmp_path))
            os.replace(tmp_path, self.path)
            self.meta_path.write_text(
                json.dumps(
                    {
                        "collection": self.collection,
                        "signature": self.signature,
                        "dimension": self.dimension,
                        "index_factory": self.index_factory,
                        "ntotal": int(self._index.ntotal),
                    },
                    indent=2,
                )
            )
            self._unflushed = 0
            self._dirty = False

    def close(self) -> None:
        self.flush()
        with self._lock:
            self._index = None
            if self._lock_file is not None:
                fcntl.flock(self._lock_file, fcntl.LOCK_UN)
                self._lock_file.close()
                self._lock_file = None


class VectorIndexRegistry:
    """Owns one :class:`VectorIndex` per collection.

    Injected into the ingest and retrieval services rather than reached for
    through module state, so a test can hand them a registry rooted in a temp
    directory.
    """

    def __init__(
        self,
        root: Path,
        dimension: int,
        signature: str,
        index_factory: str = "Flat",
        flush_every: int = 1,
        collections: Sequence[str] = COLLECTIONS,
    ) -> None:
        self._root = Path(root)
        self._dimension = dimension
        self._signature = signature
        self._index_factory = index_factory
        self._flush_every = flush_every
        self._collections = tuple(collections)
        self._indexes: dict[str, VectorIndex] = {}
        self._lock = threading.Lock()

    def get(self, collection: str = GLOBAL_COLLECTION) -> VectorIndex:
        """The global index. Every logical collection name resolves to it.

        Callers still pass ``PUBLIC_COLLECTION`` / ``USER_COLLECTION`` to say
        which corpus a document belongs to -- that distinction is real and is
        stored in SQLite -- but there is one physical index behind all of them,
        and isolation is enforced by id partition rather than by file.
        """
        collection = self._normalize(collection)
        with self._lock:
            index = self._indexes.get(collection)
            if index is None:
                index = VectorIndex(
                    collection=collection,
                    path=self._root / f"{collection}.faiss",
                    dimension=self._dimension,
                    signature=self._signature,
                    index_factory=self._index_factory,
                    flush_every=self._flush_every,
                )
                self._indexes[collection] = index
        return index.load()

    @staticmethod
    def _normalize(collection: str) -> str:
        """Map any logical collection name onto the single physical index."""
        if collection in (GLOBAL_COLLECTION, *LOGICAL_COLLECTIONS):
            return GLOBAL_COLLECTION
        raise ValueError(
            f"Unknown collection {collection!r}. Expected one of: "
            f"{', '.join((GLOBAL_COLLECTION, *LOGICAL_COLLECTIONS))}"
        )

    def global_index(self) -> VectorIndex:
        """Preferred accessor now that there is exactly one index."""
        return self.get(GLOBAL_COLLECTION)

    def load_all(self) -> None:
        """Warm the index. Called once at startup."""
        self._root.mkdir(parents=True, exist_ok=True)
        for collection in self._collections:
            self.get(collection)

    def counts(self) -> dict[str, int]:
        return {name: index.ntotal for name, index in self._indexes.items()}

    def flush_all(self) -> None:
        for index in list(self._indexes.values()):
            index.flush()

    def close(self) -> None:
        for index in list(self._indexes.values()):
            index.close()
        self._indexes.clear()
