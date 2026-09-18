"""Build a FAISS index from scratch by embedding every stored chunk in bulk.

Offline, resumable, and separate from the serving process -- implements
FAISS_ARCHITECTURE.md §9's embed/train/add/flush sequence:

    cd backend
    FAISS_INDEX_FACTORY="OPQ64_1024,IVF8192,PQ64" \
      .venv/bin/python -m rag.scripts.build_index --collection lexvert --yes

This exists for the case ``rag/scripts/rebuild_index.py`` cannot handle: a
compressed (IVF/PQ) factory needs on the order of ``nlist`` × 100 vectors in
one training call, not the small per-batch ``add()``s an ordinary rebuild
makes -- see that script's docstring, and PRODUCTION_TODO.md T9/T9a. Every
vector is embedded once, in full, to a memory-mapped checkpoint file *before*
anything touches FAISS; only once every chunk has a vector on disk does
training and adding begin. A run killed mid-embed resumes from the
checkpoint instead of re-embedding, because embedding -- not training or
adding -- is the expensive step (FAISS_ARCHITECTURE.md §9's throughput table).

Like ``rebuild_index.py``, this builds into a staging file and swaps it into
place only on success, so an interrupted run leaves the live index untouched.
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from rag.core.services import EMBEDDING_SIGNATURE_KEY, RagServices, build_services, shutdown, startup
from rag.core.vector_index import GLOBAL_COLLECTION, LOGICAL_COLLECTIONS, VectorIndex
from rag.scripts.rebuild_index import RebuildRefused, _existing_ntotal, _swap

logger = logging.getLogger("build_index")

# Rows pulled from SQLite per round trip while embedding.
FETCH_SIZE = 512
# Vectors added to FAISS per add_with_ids call once the index is trained --
# FAISS_ARCHITECTURE.md §9 step 4.
ADD_BATCH_SIZE = 1_000_000
# FAISS's own minimum training points per centroid before it starts warning
# and producing a degenerate quantizer (PRODUCTION_TODO.md T9a). A floor under
# whatever FAISS_TRAIN_THRESHOLD is configured to, so a too-low setting cannot
# silently produce a bad index instead of a loud error.
MIN_TRAINING_VECTORS_PER_CENTROID = 39

# Same year pattern rag/core/paths.py::_year_segment matches -- `doc_date` is
# free text from whatever the source publishes, not a guaranteed ISO date, so
# a 4-digit year is the only thing worth extracting from it for T9b's
# training-sample date range.
_YEAR_RE = re.compile(r"(1[6-9]\d{2}|2[01]\d{2})")

# How many of the training sample's faiss_ids to actually look up in SQLite
# for T9b's recorded date range. This is metadata for an operator reading the
# sidecar, not a value anything computes drift from, so a bounded peek is
# enough -- capping it keeps a build with hundreds of thousands of training
# vectors from turning into hundreds of IN() round trips.
TRAINING_DATE_RANGE_SAMPLE_CAP = 2_000


class BuildRefused(RebuildRefused):
    """Raised instead of building an index that would silently drop live
    vectors -- the same shape of refusal as :class:`RebuildRefused`, kept as
    a distinct name because it is this module's own guard, not a re-export."""


class Checkpoint:
    """Memory-mapped embedding progress for one build.

    ``vectors`` and ``ids`` are parallel, positional arrays sized for the
    chunk count observed when the checkpoint was created. Only the leading
    ``done`` rows are meaningful -- the rest is unwritten preallocated space,
    not zeros that mean anything. This *is* the resumability
    FAISS_ARCHITECTURE.md §9 describes: a run killed partway through never
    re-embeds a row that already made it to disk, because ``append`` flushes
    both arrays and a matching ``progress.json`` before returning.

    A checkpoint is scoped to one collection set, embedding signature and
    dimension. If any of those changed since it was written, ``open()``
    starts over rather than resuming into a checkpoint that no longer means
    what its filename says -- a stale resume is a worse bug than a slower one.
    """

    def __init__(
        self,
        directory: Path,
        total: int,
        dimension: int,
        signature: str,
        collections: tuple[str, ...],
    ) -> None:
        self.directory = directory
        self.total = total
        self.dimension = dimension
        self.signature = signature
        self.collections = tuple(sorted(collections))
        self.progress_path = directory / "progress.json"
        self.vectors_path = directory / "vectors.f32"
        self.ids_path = directory / "ids.i64"
        self.done = 0
        self.vectors: np.memmap | None = None
        self.ids: np.memmap | None = None

    def open(self) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        if self._resume_matches():
            state = json.loads(self.progress_path.read_text())
            self.done = state["done"]
            if self.done:
                logger.info("Resuming embedding checkpoint at %d/%d chunks", self.done, self.total)
        else:
            self.done = 0
            self._write_progress()

        # Only actually resume (open for read/write, preserving what's there)
        # when there is something on disk to preserve. Otherwise create fresh,
        # which also covers a stale/mismatched checkpoint from a previous run.
        mode = "r+" if self.done and self.vectors_path.exists() else "w+"
        self.vectors = np.memmap(
            self.vectors_path, dtype=np.float32, mode=mode, shape=(self.total, self.dimension)
        )
        self.ids = np.memmap(self.ids_path, dtype=np.int64, mode=mode, shape=(self.total,))

    def _resume_matches(self) -> bool:
        if not (self.progress_path.exists() and self.vectors_path.exists() and self.ids_path.exists()):
            return False
        try:
            state = json.loads(self.progress_path.read_text())
        except (OSError, json.JSONDecodeError):
            return False
        return (
            state.get("total") == self.total
            and state.get("dimension") == self.dimension
            and state.get("signature") == self.signature
            and state.get("collections") == list(self.collections)
        )

    def _write_progress(self) -> None:
        self.progress_path.write_text(
            json.dumps(
                {
                    "total": self.total,
                    "dimension": self.dimension,
                    "signature": self.signature,
                    "collections": list(self.collections),
                    "done": self.done,
                }
            )
        )

    @property
    def last_faiss_id(self) -> int:
        """The cursor to resume the keyset-paginated read from."""
        return int(self.ids[self.done - 1]) if self.done else 0

    def append(self, ids: list[int], vectors: np.ndarray) -> None:
        n = len(ids)
        self.vectors[self.done : self.done + n] = vectors
        self.ids[self.done : self.done + n] = ids
        # Durable before progress.json says it happened -- the reverse order
        # would let a crash leave progress.json claiming rows that never made
        # it to the mmap.
        self.vectors.flush()
        self.ids.flush()
        self.done += n
        self._write_progress()

    def clear(self) -> None:
        """Delete the checkpoint once its build has been swapped into place."""
        self.vectors = None
        self.ids = None
        for path in (self.vectors_path, self.ids_path, self.progress_path):
            path.unlink(missing_ok=True)
        try:
            self.directory.rmdir()
        except OSError:
            pass  # not empty (e.g. a concurrent run) -- leave it


def build_collections(
    services: RagServices,
    collections: list[str],
    *,
    add_batch_size: int = ADD_BATCH_SIZE,
    force: bool = False,
) -> int:
    """Embed, train and index the given logical collections. Returns the vector count.

    Mirrors ``rebuild_index.py::rebuild_collections``'s two data-loss guards
    (an omitted logical collection that still has chunks; a zero-row result
    against an already non-empty live index) for the same reason: one physical
    FAISS index sits behind both logical collections, so a build that leaves
    one out -- or resolves nothing by mistake -- would silently drop live
    vectors when swapped in.
    """
    config = services.config
    conn = services.metadata.connection

    present = {
        row[0] for row in conn.execute("SELECT DISTINCT collection FROM chunks").fetchall()
    }
    omitted = present - set(collections)
    if omitted and not force:
        raise BuildRefused(
            f"chunks exist in {sorted(omitted)}, which {'is' if len(omitted) == 1 else 'are'} not "
            f"included in this build ({sorted(collections)}). Every logical collection shares one "
            "physical FAISS index, so building without them would silently drop their vectors from "
            "the live index. Pass --collection for each of them (or --all), or --force to proceed "
            "anyway."
        )

    target_path = config.faiss_index_path(GLOBAL_COLLECTION)
    # Keeps the .faiss extension so the sidecar lands at <name>.build.meta.json
    # rather than colliding with the live index's own metadata file.
    staging_path = target_path.with_name(f"{target_path.stem}.build.faiss")

    placeholders = ",".join("?" for _ in collections)
    total = conn.execute(
        f"SELECT COUNT(*) FROM chunks WHERE collection IN ({placeholders})", tuple(collections)
    ).fetchone()[0]

    if total == 0:
        existing_ntotal = _existing_ntotal(target_path)
        if existing_ntotal > 0 and not force:
            raise BuildRefused(
                f"0 chunks resolved for {sorted(collections)}, but the live index at {target_path} "
                f"already holds {existing_ntotal} vector(s). Swapping an empty index over a "
                "non-empty one is almost certainly a bug in the query, not an empty corpus. Pass "
                "--force to do it anyway."
            )
        logger.info("no chunks to index across %s", collections)
        if staging_path.exists():
            staging_path.unlink()
        empty = VectorIndex(
            collection=GLOBAL_COLLECTION,
            path=staging_path,
            dimension=services.embedder.dimension,
            signature=services.signature,
            index_factory=config.faiss_index_factory,
            flush_every=10**9,
        )
        empty.load()
        empty.flush()
        _swap(staging_path, target_path)
        return 0

    checkpoint_dir = config.faiss_root / f"{target_path.stem}.build_checkpoint"
    checkpoint = Checkpoint(
        checkpoint_dir,
        total=total,
        dimension=services.embedder.dimension,
        signature=services.signature,
        collections=tuple(collections),
    )
    checkpoint.open()

    if checkpoint.done < checkpoint.total:
        _embed(services, collections, checkpoint)

    if staging_path.exists():
        staging_path.unlink()
    staging = VectorIndex(
        collection=GLOBAL_COLLECTION,
        path=staging_path,
        dimension=services.embedder.dimension,
        signature=services.signature,
        index_factory=config.faiss_index_factory,
        # Written explicitly at the two points that matter (post-train,
        # post-add) -- see the flush() calls below -- not on every add().
        flush_every=10**9,
    )
    staging.load()

    if not staging.index.is_trained:
        _train(services, staging, checkpoint)
        # Persist the trained-but-empty index before adding anything, per
        # FAISS_ARCHITECTURE.md §9 step 3 -- a crash during the (much longer)
        # add phase below then only costs re-adding, never re-training.
        staging.flush()

    _add(staging, checkpoint, add_batch_size)
    staging.flush()

    _swap(staging_path, target_path)
    checkpoint.clear()
    logger.info("built %d vector(s) across %s", checkpoint.total, collections)
    return checkpoint.total


def _embed(services: RagServices, collections: list[str], checkpoint: Checkpoint) -> None:
    """Step 2: embed every chunk to the memory-mapped checkpoint file."""
    conn = services.metadata.connection
    placeholders = ",".join("?" for _ in collections)
    started = time.time()
    last_faiss_id = checkpoint.last_faiss_id

    while checkpoint.done < checkpoint.total:
        limit = min(FETCH_SIZE, checkpoint.total - checkpoint.done)
        rows = conn.execute(
            f"SELECT faiss_id, chunk_text FROM chunks WHERE collection IN ({placeholders}) "
            "AND faiss_id > ? ORDER BY faiss_id LIMIT ?",
            (*collections, last_faiss_id, limit),
        ).fetchall()
        if not rows:
            # The corpus shrank (or moved) under us since `total` was counted.
            # Stop rather than loop forever re-asking for rows past the end.
            logger.warning(
                "Expected %d more chunk(s) but found none past faiss_id %d; stopping short at %d/%d.",
                checkpoint.total - checkpoint.done, last_faiss_id, checkpoint.done, checkpoint.total,
            )
            break

        vectors = services.embedder.embed_documents(
            [services.metadata.decode_chunk_text(r["chunk_text"]) for r in rows]
        )
        ids = [r["faiss_id"] for r in rows]
        checkpoint.append(ids, vectors)
        last_faiss_id = ids[-1]

        elapsed = time.time() - started
        rate = checkpoint.done / elapsed if elapsed else 0
        logger.info("embedded %d/%d chunks (%.1f/s)", checkpoint.done, checkpoint.total, rate)


def _train(services: RagServices, staging: VectorIndex, checkpoint: Checkpoint) -> None:
    """Step 3: train on a sample drawn from the completed embedding checkpoint."""
    import faiss

    try:
        ivf = faiss.extract_index_ivf(staging.index)
    except RuntimeError:
        ivf = None

    available = checkpoint.done
    if ivf is None:
        # A factory that needs training but has no IVF component (plain PQ,
        # OPQ without IVF) has no nlist to size a sample against -- train on
        # everything that was embedded.
        sample_size = available
    else:
        nlist = int(ivf.nlist)
        # FAISS_TRAIN_THRESHOLD governs the target sample size; FAISS's own
        # per-centroid minimum is the floor under it, so a too-low setting
        # cannot silently produce a degenerate quantizer instead of a loud
        # error below.
        target = max(services.config.faiss_train_threshold, MIN_TRAINING_VECTORS_PER_CENTROID * nlist)
        sample_size = min(available, target)
        if sample_size < nlist:
            raise BuildRefused(
                f"Only {available} chunk(s) available, but factory '{staging.index_factory}' needs "
                f"at least {nlist} training vectors (nlist) and ideally {target}. Ingest more of the "
                "corpus before building an index this large, or lower FAISS_INDEX_FACTORY's nlist."
            )

    if sample_size < available:
        rng = np.random.default_rng(0)
        positions = np.sort(rng.choice(available, size=sample_size, replace=False))
    else:
        positions = np.arange(available)
    sample = np.asarray(checkpoint.vectors[positions])

    logger.info("training %s on %d of %d embedded vectors", staging.collection, sample_size, available)
    sample_ids = checkpoint.ids[positions].tolist()
    date_range = _training_date_range(services.metadata.connection, sample_ids)
    # `checkpoint.done`, not `sample_size`: the training call only sees a
    # sample, but every embedded row is what `_add` adds right after, so
    # that -- not the (possibly much smaller) training sample -- is the
    # corpus size T9b's drift signals should measure growth against.
    staging.train(sample, trained_at_ntotal=checkpoint.done, training_date_range=date_range)


def _training_date_range(conn, faiss_ids: list[int]) -> tuple[str, str] | None:
    """Best-effort (min, max) document year covering the given faiss_ids.

    ``documents.doc_date`` is free text from whatever the source publishes --
    not a guaranteed ISO date -- so this only extracts a 4-digit year rather
    than trying to sort arbitrary date strings. ``None`` when none of the
    sampled documents have a recognisable date, which is expected for
    material that predates this field.
    """
    if not faiss_ids:
        return None
    if len(faiss_ids) > TRAINING_DATE_RANGE_SAMPLE_CAP:
        rng = np.random.default_rng(0)
        faiss_ids = rng.choice(
            faiss_ids, size=TRAINING_DATE_RANGE_SAMPLE_CAP, replace=False
        ).tolist()

    years: set[str] = set()
    batch_size = 500
    for start in range(0, len(faiss_ids), batch_size):
        batch = faiss_ids[start : start + batch_size]
        placeholders = ",".join("?" for _ in batch)
        rows = conn.execute(
            f"SELECT DISTINCT d.doc_date FROM chunks c JOIN documents d ON d.document_id = c.document_id "
            f"WHERE c.faiss_id IN ({placeholders}) AND d.doc_date IS NOT NULL",
            batch,
        ).fetchall()
        for (doc_date,) in rows:
            match = _YEAR_RE.search(str(doc_date))
            if match:
                years.add(match.group(1))

    if not years:
        return None
    return (min(years), max(years))


def _add(staging: VectorIndex, checkpoint: Checkpoint, add_batch_size: int) -> None:
    """Step 4: stream the checkpoint into the (now trained) index."""
    total = checkpoint.done
    started = time.time()
    for start in range(0, total, add_batch_size):
        end = min(start + add_batch_size, total)
        ids = checkpoint.ids[start:end].tolist()
        vectors = np.asarray(checkpoint.vectors[start:end])
        staging.add(ids, vectors)

        elapsed = time.time() - started
        rate = end / elapsed if elapsed else 0
        logger.info("added %d/%d vectors (%.1f/s)", end, total, rate)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collection", action="append", choices=list(LOGICAL_COLLECTIONS))
    parser.add_argument("--all", action="store_true", help="Build every collection")
    parser.add_argument(
        "--add-batch-size", type=int, default=ADD_BATCH_SIZE,
        help="Vectors per add_with_ids call once training is done (default: %(default)s)",
    )
    parser.add_argument("--yes", action="store_true", help="Skip the confirmation prompt")
    parser.add_argument(
        "--force",
        action="store_true",
        help=(
            "Proceed even if this would empty a non-empty live index, or drop a logical "
            "collection's chunks that weren't included in --collection"
        ),
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(message)s")

    collections = list(LOGICAL_COLLECTIONS) if args.all else (args.collection or [])
    if not collections:
        parser.error("Pass --collection <name> (repeatable) or --all")

    services = build_services()
    # Same reasoning as rebuild_index.py: the signature check would otherwise
    # refuse to start if the model already changed, and adopting the new
    # signature first is the point of running this at all when it has.
    services.metadata.initialize()
    services.metadata.set_meta(EMBEDDING_SIGNATURE_KEY, services.signature)
    startup(services)

    print(f"Building {', '.join(collections)} with {services.signature} ({services.config.faiss_index_factory})")
    print(f"  chunks: {services.metadata.stats()['chunk_count']}")
    if not args.yes:
        if input("This embeds every chunk and can take hours. Continue? [y/N] ").lower() != "y":
            print("Aborted.")
            shutdown(services)
            return 1

    # Drop the loaded (old) indexes before building -- letting shutdown flush
    # them afterwards would write the stale index straight back over the one
    # this script just built.
    services.indexes.close()

    try:
        build_collections(services, collections, add_batch_size=args.add_batch_size, force=args.force)
    except RebuildRefused as exc:
        print(f"Refused: {exc}")
        return 1
    finally:
        shutdown(services)

    print("Done. Restart the API so it loads the built index.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
