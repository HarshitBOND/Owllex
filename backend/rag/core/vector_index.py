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
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import numpy as np

logger = logging.getLogger("ravenslaw.rag.faiss")

# PRODUCTION_TODO.md T17: how often a loaded index re-`stat`s its sidecar to
# notice another process's flush. A `stat()` is cheap enough to do on every
# search, but that would still be one extra syscall per query for no benefit
# between flushes (which, per FAISS_FLUSH_EVERY/FAISS_FLUSH_MAX, are at most
# every few seconds even under heavy ingest) -- so this throttles the *check*,
# not the reload itself: a generation change is always picked up on the first
# search at or after this many seconds have elapsed since the last check.
_RELOAD_CHECK_INTERVAL_SECONDS = 2.0

# FAISS's own minimum training points per centroid before it starts warning and
# producing a degenerate quantizer (PRODUCTION_TODO.md T9a). Duplicated from
# rag/scripts/build_index.py's identical constant rather than imported -- core
# must not depend on scripts, and the two enforce the same FAISS fact at two
# different layers (this one guards the implicit per-`add()` training path;
# that one guards the explicit bulk-build path, which allows down to `nlist`
# itself since an operator building in bulk sees the log line either way).
MIN_TRAINING_VECTORS_PER_CENTROID = 39

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
        flush_max: int = 100_000,
        nprobe: int = 16,
        mmap: bool = False,
    ) -> None:
        self.collection = collection
        self.path = Path(path)
        self.meta_path = self.path.with_suffix(".meta.json")
        self.dimension = dimension
        self.signature = signature
        self.index_factory = index_factory
        self.nprobe = nprobe
        # PRODUCTION_TODO.md T17: read the index with faiss.IO_FLAG_MMAP
        # instead of fully deserialising it into RAM. Only probed inverted
        # lists are then touched per search instead of the whole file, which
        # is what keeps resident memory near the coarse quantizer's size
        # rather than the whole corpus at tier 3/4. Must be False in whichever
        # process writes (see _acquire_write_lock and the reload note below) --
        # FAISS does not support mutating a memory-mapped index in place.
        self._mmap = mmap
        self._flush_every = max(1, flush_every)
        # Never below the floor: a caller that deliberately passes a huge
        # flush_every (rebuild_index.py's staging index uses 10**9 to defer
        # every flush to one explicit call at the end) must not have that
        # lowered by the ceiling -- see _effective_flush_threshold.
        self._flush_max = max(self._flush_every, flush_max)
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
        # PRODUCTION_TODO.md T9b: the corpus size (and, best-effort, the
        # document date range of the training sample) as of the last time a
        # non-flat factory was trained. Compared against the live `ntotal` to
        # report how much the corpus has grown since -- a compressed index's
        # quantizer is trained once, on the corpus as it existed that day, and
        # nothing else records what "that day" looked like. Populated either
        # by `train()`/`_train()`, or from the sidecar when an existing index
        # with these fields already recorded is loaded -- see `_verify_meta`.
        self.trained_at_ntotal: int | None = None
        self.training_date_range: tuple[str, str] | None = None

        # PRODUCTION_TODO.md T17: monotonically bumped by every `flush()` and
        # persisted in the sidecar, so a reader that opened the file at an
        # older generation can tell -- without diffing contents -- that a
        # newer one exists on disk. `_last_reload_check` throttles how often a
        # search bothers to `stat()` the sidecar; see
        # `_RELOAD_CHECK_INTERVAL_SECONDS`.
        self._generation: int = 0
        self._last_reload_check: float = 0.0

    # ─── Lifecycle ───────────────────────────────────────────────────────────

    def load(self) -> "VectorIndex":
        """Load the index from disk, or create an empty one. Idempotent."""
        import faiss

        with self._lock:
            if self._index is not None:
                return self

            if self.path.exists():
                self._verify_meta()
                index = self._read_index_from_disk(faiss)
                if index.d != self.dimension:
                    raise RuntimeError(
                        f"{self.path} was built with dimension {index.d}, but EMBED_DIM is "
                        f"{self.dimension}. Re-embed the corpus or restore the matching index."
                    )
                logger.info(
                    "Loaded FAISS index %s (%d vectors, dim %d, factory %s)",
                    self.collection, index.ntotal, index.d, self.index_factory,
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

    def _read_index_from_disk(self, faiss):
        """`faiss.read_index`, memory-mapped when configured (T17).

        ``IO_FLAG_MMAP`` makes FAISS touch only the pages a search actually
        probes instead of deserialising the whole file into RAM -- at tier 4
        the difference is the ~124 GB FAISS_ARCHITECTURE.md §6 budgets versus
        the coarse quantizer alone (a few GB). Only meaningful for a factory
        with inverted lists to page in lazily; harmless to pass regardless.
        """
        if self._mmap:
            return faiss.read_index(str(self.path), faiss.IO_FLAG_MMAP)
        return faiss.read_index(str(self.path))

    def _verify_meta(self) -> None:
        """Refuse to load an index built by a different model or factory.

        Vectors from two embedding models are not comparable, and mixing them
        does not error -- it just returns confidently wrong neighbours. A
        factory change is quieter still: it changes nothing about *reading* an
        existing file (`faiss.read_index` just reads whatever is there), so
        without this check the configured factory would silently describe a
        different index than the one actually loaded. This is the only place
        either mismatch can still be caught cheaply, before the first search.
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

        # Carried forward regardless of whether the checks below pass -- these
        # are informational (T9b's drift signals), not something to verify,
        # and a process that loads an already-trained index still needs them
        # to compute drift later.
        stored_trained_at = meta.get("trained_at_ntotal")
        if isinstance(stored_trained_at, int):
            self.trained_at_ntotal = stored_trained_at
        stored_date_range = meta.get("training_date_range")
        if isinstance(stored_date_range, list) and len(stored_date_range) == 2:
            self.training_date_range = (stored_date_range[0], stored_date_range[1])

        # T17: baseline generation for the reload check below. Absent on an
        # index written before this field existed -- 0 is correct there too,
        # since flush() will write generation 1 on its own first write and
        # nothing on disk claims a newer one in the meantime.
        stored_generation = meta.get("generation")
        if isinstance(stored_generation, int):
            self._generation = stored_generation

        stored = meta.get("signature")
        if stored and stored != self.signature:
            raise RuntimeError(
                f"FAISS index {self.path.name} was built with embeddings '{stored}' but this "
                f"process is configured for '{self.signature}'. Re-embed the corpus "
                f"(rag/scripts/rebuild_index.py) or restore the matching index."
            )

        # PRODUCTION_TODO.md T5a: changing FAISS_INDEX_FACTORY without rebuilding
        # used to be a silent no-op -- load() never looked at it, only
        # _new_index() did, on the path where no file exists yet. An operator
        # setting FAISS_INDEX_FACTORY=OPQ64,IVF32768,PQ64 and restarting would
        # get no error and a Flat index, or the reverse.
        stored_factory = meta.get("index_factory")
        if stored_factory is None:
            # Written before this field existed. Warning rather than refusing:
            # an older index has no recorded factory to compare, and refusing
            # to boot on it would be worse than the drift it might be hiding.
            logger.warning(
                "%s has no recorded index_factory in its sidecar metadata; cannot verify it "
                "matches the configured factory (%s)", self.path.name, self.index_factory,
            )
        elif stored_factory != self.index_factory:
            raise RuntimeError(
                f"FAISS index {self.path.name} was built with factory '{stored_factory}' but "
                f"this process is configured for '{self.index_factory}'. Rebuild it with "
                f"rag/scripts/rebuild_index.py, or restore the matching configuration."
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

        PRODUCTION_TODO.md T17: this guard is **per-process, not a global
        ban on writing** -- it does not know or care whether this process
        also happens to be reading with ``FAISS_MMAP`` on. The design it
        enforces is a role split, not a mode split: the ingest worker writes
        and runs with ``FAISS_MMAP=false`` (mmap and mutation do not mix, and
        the worker never searches, so it has nothing to gain from mmap
        anyway); the API mmaps and never calls `add`/`remove`/`flush` at all,
        so it never reaches this method; `backup_now.py` (T2a) opens
        `read_only=True`, so it never reaches it either. A process on the
        wrong side of that split -- an API instance that somehow tried to
        write, or two ingest workers started at once -- is exactly what this
        lock exists to fail loudly rather than let corrupt silently.
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

    def train(
        self,
        vectors: np.ndarray,
        *,
        trained_at_ntotal: int | None = None,
        training_date_range: tuple[str, str] | None = None,
    ) -> None:
        """Explicitly train a non-flat factory on a bulk sample.

        For a bulk build (``rag/scripts/build_index.py``), which must train on
        a large, representative sample drawn from the whole corpus before any
        vector is added -- unlike ``add()``'s own implicit ``_train()``, which
        only ever sees whatever batch happened to trigger it, and is exactly
        what makes a compressed factory's first ordinary ``add()`` fail (see
        PRODUCTION_TODO.md T9/T9a). A no-op if the index is already trained
        (e.g. every call after the first, or a factory like ``Flat`` that
        never needs training), so callers can invoke it unconditionally.

        ``trained_at_ntotal``/``training_date_range`` (T9b) record what the
        corpus looked like at training time, for the drift signals in
        :meth:`drift_stats`. The caller passes them because only it knows the
        true corpus size the training sample was drawn from (the sample
        itself may be a fraction of it) and, from SQLite, the sample's date
        range -- neither is derivable from ``vectors`` alone.
        """
        vectors = self._as_matrix(vectors)
        with self._lock:
            self._acquire_write_lock()
            index = self.index
            if index.is_trained:
                return
            self._train(vectors, trained_at_ntotal=trained_at_ntotal)
            if training_date_range is not None:
                self.training_date_range = training_date_range
            self._dirty = True

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

    def _train(self, vectors: np.ndarray, *, trained_at_ntotal: int | None = None) -> None:
        """Train a non-flat factory (IVF/PQ) before its first insert.

        Deliberately not buffered: silently holding vectors back until enough
        arrive would make them unsearchable, and invisible in the index count,
        with nothing in the logs to explain it. An operator building a compressed
        index trains it explicitly from the corpus (rag/scripts/rebuild_index.py).

        The dead-guard bug this replaces (PRODUCTION_TODO.md T9a): reading
        ``nlist`` off ``self.index.index`` reads it off the SWIG base
        ``faiss::Index`` pointer, which never has the attribute regardless of
        what the wrapped index actually is, so ``getattr(..., 1)`` always
        returned 1 and the check below never fired. ``faiss.extract_index_ivf``
        is the same helper ``_build_params`` already uses to find the real IVF
        index through any wrapping (``IndexIDMap2``, OPQ's
        ``IndexPreTransform``, etc.), or raises if there isn't one -- which is
        also true of a plain (non-IVF) PQ/OPQ factory, so that case trains on
        whatever the batch holds rather than being blocked by a guard with
        nothing to size itself against.
        """
        import faiss

        try:
            ivf = faiss.extract_index_ivf(self.index)
        except RuntimeError:
            ivf = None
        nlist = int(ivf.nlist) if ivf is not None else 0
        # FAISS's own recommended minimum, not the bare "at least nlist": below
        # 39x nlist it merely warns and produces a degenerate quantizer instead
        # of raising, so a batch that clears nlist but not this floor would
        # train silently instead of loudly.
        needed = MIN_TRAINING_VECTORS_PER_CENTROID * nlist if nlist else 1
        if vectors.shape[0] < needed:
            raise RuntimeError(
                f"FAISS index '{self.collection}' uses factory '{self.index_factory}', which must "
                f"be trained on at least {needed} vectors before the first insert, but this batch "
                f"has {vectors.shape[0]}. Build it in bulk with rag/scripts/rebuild_index.py, or "
                f"set FAISS_INDEX_FACTORY=Flat."
            )
        logger.info("Training %s on %d vectors", self.collection, vectors.shape[0])
        self.index.train(vectors)
        # PRODUCTION_TODO.md T9b: the baseline `drift_stats` measures growth
        # against. `add()`'s implicit path has no better number than "however
        # many vectors are in the batch that triggered training" -- that
        # whole batch is what gets added immediately afterwards. The explicit
        # bulk path (`train()`) passes the true final corpus size instead,
        # since its training sample is deliberately smaller than what will
        # actually be added.
        self.trained_at_ntotal = (
            trained_at_ntotal if trained_at_ntotal is not None else vectors.shape[0]
        )

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

        self._maybe_reload()

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

    def _maybe_reload(self) -> None:
        """Pick up a newer generation flushed by another process (T17).

        The hazard this exists for: ``flush()`` writes a temp file and
        ``os.replace``s it over the live one. Rename swaps the directory
        entry to a new inode; it does not touch a file this process already
        opened -- ``faiss.read_index`` (mmap or not) keeps reading the old
        inode's bytes forever. Reproduced on faiss 1.15.0: a reader opened at
        ntotal 2000 still reports 2000, and cannot see ids the writer added
        past that point, after the writer's ``os.replace`` -- silently and
        permanently, until the reader process restarts. That is worst for a
        mmapped reader (T17's whole point is to *not* reload the file into
        RAM), but a fully-loaded, non-mmap reader is exactly as stale --
        `read_index` without the mmap flag also never looks at the file
        again -- so this check is not gated on ``self._mmap``.

        Throttled to at most once per ``_RELOAD_CHECK_INTERVAL_SECONDS`` so a
        hot search path pays a ``stat()`` only occasionally, not per query.
        The actual swap happens under ``self._lock``, the same lock `search()`
        holds for the whole duration of the native FAISS call below -- so a
        reload can never happen while a search on the old handle is
        in-flight; it simply waits for the lock like any other writer would,
        and the old handle is only dropped (and eligible for GC) once no
        thread can still be inside a call using it.
        """
        if self._index is None:
            return
        now = time.monotonic()
        with self._lock:
            if now - self._last_reload_check < _RELOAD_CHECK_INTERVAL_SECONDS:
                return
            self._last_reload_check = now
            if not self.meta_path.exists():
                return
            try:
                meta = json.loads(self.meta_path.read_text())
            except (OSError, json.JSONDecodeError) as exc:
                logger.warning("Could not read %s for reload check: %s", self.meta_path, exc)
                return
            generation = meta.get("generation")
            if not isinstance(generation, int) or generation <= self._generation:
                return

            import faiss

            try:
                new_index = self._read_index_from_disk(faiss)
            except Exception:
                logger.exception(
                    "Failed to reload FAISS index %s at generation %d; keeping the "
                    "previous handle (generation %d)",
                    self.collection, generation, self._generation,
                )
                return
            if new_index.d != self.dimension:
                logger.error(
                    "Refusing to reload %s: on-disk dimension %d does not match "
                    "configured EMBED_DIM %d", self.path.name, new_index.d, self.dimension,
                )
                return

            old_generation = self._generation
            old_ntotal = self.ntotal
            self._index = new_index
            self._generation = generation
            logger.info(
                "Reloaded FAISS index %s: generation %d -> %d (%d -> %d vectors)",
                self.collection, old_generation, generation, old_ntotal, int(new_index.ntotal),
            )

    def _build_params(self, faiss, scope: "SearchFilter"):
        """Turn a scope into FAISS search parameters plus the objects to keep alive.

        An IVF index (including one wrapped in IDMap2, OPQ's IndexPreTransform,
        etc.) rejects a plain ``SearchParameters`` outright -- it requires
        ``SearchParametersIVF``, which is also the only place ``nprobe`` can be
        set per search. ``faiss.extract_index_ivf`` finds the underlying IVF
        index through any wrapping, or raises if there isn't one, which is why
        this is wrapped in a ``try`` rather than an isinstance check against
        every wrapper type FAISS_ARCHITECTURE.md's factories can produce.
        """
        try:
            ivf = faiss.extract_index_ivf(self.index)
        except RuntimeError:
            ivf = None

        if scope.unrestricted and ivf is None:
            # The common case on Flat/HNSW: no selector to build and no
            # per-search parameter (nprobe or otherwise) to carry. An
            # unrestricted search on an IVF index still needs params, purely
            # to set nprobe, so that case falls through to build one below.
            return None, ()

        keepalive: list = []
        selector = None

        if not scope.unrestricted:
            selectors = []

            if scope.include_public:
                # A range check, not a list: the public corpus is the large side
                # and must never be enumerated per query.
                public = faiss.IDSelectorRange(PUBLIC_ID_MIN, PRIVATE_ID_MIN)
                selectors.append(public)
                keepalive.append(public)

            if scope.allowed_ids:
                batch = faiss.IDSelectorBatch(np.asarray(scope.allowed_ids, dtype=np.int64))
                selectors.append(batch)
                keepalive.append(batch)

            if not selectors:
                # Unreachable: matches_nothing covers the empty-allow-list case
                # and unrestricted is handled above. Raising rather than
                # defaulting to "no filter" keeps the fail-safe direction
                # pointing at "return nothing" if a future branch misses a case.
                raise RuntimeError("SearchFilter produced no selector; refusing an unscoped search")

            selector = selectors[0]
            for extra in selectors[1:]:
                selector = faiss.IDSelectorOr(selector, extra)
                keepalive.append(selector)

        params = faiss.SearchParametersIVF() if ivf is not None else faiss.SearchParameters()
        if ivf is not None:
            params.nprobe = self.nprobe
        if selector is not None:
            params.sel = selector
        keepalive.append(params)
        return params, tuple(keepalive)

    def ivf_list_stats(self) -> dict[str, Any] | None:
        """Inverted-list size distribution for an IVF-based factory.

        ``None`` for Flat/HNSW/plain-PQ factories, which have no inverted
        lists to imbalance.

        PRODUCTION_TODO.md T9b: the real quantizer-drift failure mode is list
        *imbalance* from training on one distribution and then adding
        another -- not fragmentation from deletes. ``remove_ids`` genuinely
        compacts an IVF index (verified: deleting half of 4,000 vectors took
        ``sum(list_size)`` from 4,000 to 2,000 and shrank the file
        proportionally), so a deleted-vector percentage is not the signal to
        alarm on; a lopsided ``max/mean`` ratio is.
        """
        import faiss

        with self._lock:
            if self._index is None:
                return None
            try:
                ivf = faiss.extract_index_ivf(self._index)
            except RuntimeError:
                return None
            nlist = int(ivf.nlist)
            if nlist == 0:
                return None
            sizes = [ivf.invlists.list_size(i) for i in range(nlist)]

        total = sum(sizes)
        largest = max(sizes)
        mean = total / nlist
        return {
            "nlist": nlist,
            "max_list_size": largest,
            "mean_list_size": round(mean, 2),
            "empty_lists": sum(1 for size in sizes if size == 0),
            "max_mean_ratio": round(largest / mean, 2) if mean else None,
        }

    def drift_stats(self) -> dict[str, Any] | None:
        """Quantizer-drift signals: list imbalance and growth since training.

        ``None`` when the factory has no IVF component -- see
        :meth:`ivf_list_stats`. The two numbers are independent and either
        can indicate drift on its own: an overfull list scans too much of the
        corpus per query (latency), while a court's worth of vectors that all
        landed in a handful of lists ``nprobe`` never happens to probe means
        recall for exactly that material is worst (PRODUCTION_TODO.md T9b).
        Callers should check both rather than folding them into one score.
        """
        stats = self.ivf_list_stats()
        if stats is None:
            return None

        stats["trained_at_ntotal"] = self.trained_at_ntotal
        stats["training_date_range"] = (
            list(self.training_date_range) if self.training_date_range else None
        )
        if self.trained_at_ntotal:
            added = self.ntotal - self.trained_at_ntotal
            stats["added_since_training"] = added
            stats["added_since_training_pct"] = round(added / self.trained_at_ntotal * 100, 1)
        else:
            # No recorded baseline (an index built before this field existed,
            # or one whose sidecar was lost) -- report the imbalance signal
            # alone rather than a misleading 0%/None growth figure.
            stats["added_since_training"] = None
            stats["added_since_training_pct"] = None
        return stats

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

    def _effective_flush_threshold(self) -> int:
        """Vectors that must accumulate before `_maybe_flush` triggers a flush.

        `flush()` is `O(ntotal)` -- it rewrites the whole file -- so a fixed
        threshold is right at tier 1 and roughly 9,000x too small at tier 3
        (writing ~37GB per 4MB of new vectors). The floor is `_flush_every`;
        above that it rises to ~1% of the index's current size, bounding write
        amplification at ~100x regardless of corpus size, capped at
        `_flush_max` so the crash window (vectors lost on an unclean shutdown)
        stays bounded no matter how large the index gets. The cap only limits
        how far the ntotal-derived term can push the threshold up -- it never
        lowers the floor itself.
        """
        return max(self._flush_every, min(self._index.ntotal // 100, self._flush_max))

    def _maybe_flush(self) -> None:
        if self._unflushed >= self._effective_flush_threshold():
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
            # T17: bumped on every flush, not only when it changes something a
            # reader would notice by content -- a monotonic counter is what
            # lets a reader tell "there is a newer file" apart from "I have
            # not looked in a while" without reading and diffing it.
            self._generation += 1
            self.meta_path.write_text(
                json.dumps(
                    {
                        "collection": self.collection,
                        "signature": self.signature,
                        "dimension": self.dimension,
                        "index_factory": self.index_factory,
                        "nprobe": self.nprobe,
                        "ntotal": int(self._index.ntotal),
                        "trained_at_ntotal": self.trained_at_ntotal,
                        "training_date_range": (
                            list(self.training_date_range) if self.training_date_range else None
                        ),
                        "generation": self._generation,
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
        flush_max: int = 100_000,
        nprobe: int = 16,
        mmap: bool = False,
        collections: Sequence[str] = COLLECTIONS,
    ) -> None:
        self._root = Path(root)
        self._dimension = dimension
        self._signature = signature
        self._index_factory = index_factory
        self._flush_every = flush_every
        self._flush_max = flush_max
        self._nprobe = nprobe
        self._mmap = mmap
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
                    flush_max=self._flush_max,
                    nprobe=self._nprobe,
                    mmap=self._mmap,
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
