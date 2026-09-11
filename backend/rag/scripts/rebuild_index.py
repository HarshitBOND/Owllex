"""Rebuild a FAISS index from SQLite by re-embedding every stored chunk.

SQLite holds the chunk text, so the index is reconstructible state rather than
primary data. This is the recovery path for:

* index drift after an unclean shutdown with ``FAISS_FLUSH_EVERY > 1``;
* a change to ``EMBED_MODEL`` or ``EMBED_DIM``, which invalidates every vector;
* a corrupt or lost ``.faiss`` file with no usable backup.

    cd backend
    .venv/bin/python -m rag.scripts.rebuild_index --collection lexvert
    .venv/bin/python -m rag.scripts.rebuild_index --all --yes

Embedding the whole corpus is the expensive operation in this system. The run is
resumable in the sense that it can simply be restarted -- it rebuilds from
scratch into a temporary index and swaps it in only on success, so an
interrupted run leaves the existing index untouched.

**Not** the tool for a compressed (IVF/PQ) factory, first build or otherwise:
every run here starts from a brand-new, untrained staging index and adds in
whatever ``--batch-size`` chunks at a time (``EMBED_BATCH_SIZE`` by default,
8), so a factory that needs training raises on that first small batch rather
than training on a representative sample -- see ``rag/scripts/build_index.py``,
which trains in bulk before adding anything and checkpoints its embedding
progress to a memory-mapped file so a killed run does not re-embed.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from rag.core.services import EMBEDDING_SIGNATURE_KEY, build_services, shutdown, startup
from rag.core.vector_index import GLOBAL_COLLECTION, LOGICAL_COLLECTIONS, VectorIndex

logger = logging.getLogger("rebuild_index")

# Rows pulled from SQLite per round trip. Bounds resident memory on a corpus
# too large to hold in one list.
FETCH_SIZE = 512


class RebuildRefused(RuntimeError):
    """Raised instead of performing a rebuild that would silently drop live
    vectors -- see the two checks in :func:`rebuild_collections`."""


def rebuild_collections(services, collections, batch_size: int, force: bool = False) -> int:
    """Re-embed and re-index the given logical collections. Returns the vector count.

    There is exactly one physical FAISS index behind every logical collection
    (see ``vector_index.py``): ``lexvert`` and ``lexvert_user`` are both stored
    in ``chunks.collection`` and both resolve to the same ``.faiss`` file. A
    rebuild always replaces that one file, so this reads chunk rows across
    *all* of ``collections`` and refuses -- rather than silently dropping data
    -- when either that leaves out a logical collection that actually has
    chunks, or when it resolves zero rows against a target that is not
    already empty.
    """
    config = services.config

    present = {
        row[0]
        for row in services.metadata.connection.execute(
            "SELECT DISTINCT collection FROM chunks"
        ).fetchall()
    }
    omitted = present - set(collections)
    if omitted and not force:
        raise RebuildRefused(
            f"chunks exist in {sorted(omitted)}, which {'is' if len(omitted) == 1 else 'are'} "
            f"not included in this rebuild ({sorted(collections)}). Every logical collection "
            "shares one physical FAISS index, so rebuilding without them would silently drop "
            "their vectors from the live index. Pass --collection for each of them (or --all), "
            "or --force to proceed anyway."
        )

    # The physical path is always the global index, regardless of which
    # logical collections' rows are being re-embedded into it.
    target_path = config.faiss_index_path(GLOBAL_COLLECTION)
    # Keeps the .faiss extension so the sidecar lands at <name>.rebuild.meta.json
    # rather than colliding with the live index's own metadata file.
    staging_path = target_path.with_name(f"{target_path.stem}.rebuild.faiss")

    # Built directly rather than through the registry so the live index stays
    # readable while this runs.
    staging = VectorIndex(
        collection=GLOBAL_COLLECTION,
        path=staging_path,
        dimension=services.embedder.dimension,
        signature=services.signature,
        index_factory=config.faiss_index_factory,
        # Written once, at the end -- flushing per batch would rewrite the whole
        # file on every batch.
        flush_every=10**9,
    )
    if staging_path.exists():
        staging_path.unlink()
    staging.load()

    placeholders = ",".join("?" for _ in collections)
    total = services.metadata.connection.execute(
        f"SELECT COUNT(*) FROM chunks WHERE collection IN ({placeholders})",
        tuple(collections),
    ).fetchone()[0]

    if total == 0:
        existing_ntotal = _existing_ntotal(target_path)
        if existing_ntotal > 0 and not force:
            staging_path.unlink(missing_ok=True)
            raise RebuildRefused(
                f"0 chunks resolved for {sorted(collections)}, but the live index at "
                f"{target_path} already holds {existing_ntotal} vector(s). Swapping an empty "
                "index over a non-empty one is almost certainly a bug in the query, not an "
                "empty corpus. Pass --force to do it anyway."
            )
        logger.info("no chunks to index across %s", collections)
        staging.flush()
        _swap(staging_path, target_path)
        return 0

    logger.info("re-embedding %d chunk(s) across %s", total, collections)
    started = time.time()
    done = 0
    # Keyset pagination, not OFFSET: OFFSET n re-walks n rows on every page and
    # degrades as the run proceeds -- at tier 3's 450M chunks the last page
    # would skip past almost the whole table before returning a row.
    # faiss_id is unique and monotonically allocated, so "> last seen" is a
    # stable cursor with no row to re-walk.
    last_faiss_id = 0

    while True:
        rows = services.metadata.connection.execute(
            f"SELECT faiss_id, chunk_text FROM chunks WHERE collection IN ({placeholders}) "
            "AND faiss_id > ? ORDER BY faiss_id LIMIT ?",
            (*collections, last_faiss_id, FETCH_SIZE),
        ).fetchall()
        if not rows:
            break
        last_faiss_id = rows[-1]["faiss_id"]

        for start in range(0, len(rows), batch_size):
            batch = rows[start : start + batch_size]
            vectors = services.embedder.embed_documents([r["chunk_text"] for r in batch])
            staging.add([r["faiss_id"] for r in batch], vectors)
            done += len(batch)

        elapsed = time.time() - started
        rate = done / elapsed if elapsed else 0
        logger.info("%d/%d chunks (%.1f/s)", done, total, rate)

    staging.flush()
    _swap(staging_path, target_path)
    logger.info("rebuilt %d vector(s) in %.1fs", done, time.time() - started)
    return done


def _existing_ntotal(path: Path) -> int:
    """Peek the vector count of an on-disk index, without going through the
    full :class:`VectorIndex` (whose embedding-signature check this guard
    doesn't need, and whose failure on a corrupt file would defeat the "corrupt
    index" recovery case this script also exists for).
    """
    if not path.exists():
        return 0
    import faiss

    try:
        return int(faiss.read_index(str(path)).ntotal)
    except Exception as exc:
        logger.warning("Could not read existing index %s to check for data loss: %s", path, exc)
        return 0


def _swap(staging_path: Path, target_path: Path) -> None:
    """Move the freshly built index into place, sidecar included."""
    staging_meta = staging_path.with_suffix(".meta.json")
    target_meta = target_path.with_suffix(".meta.json")
    staging_path.replace(target_path)
    if staging_meta.exists():
        staging_meta.replace(target_meta)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collection", action="append", choices=list(LOGICAL_COLLECTIONS))
    parser.add_argument("--all", action="store_true", help="Rebuild every collection")
    parser.add_argument("--batch-size", type=int, default=None, help="Override EMBED_BATCH_SIZE")
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
    # The signature check would refuse to start if the model changed, which is
    # one of the reasons to run this. Adopt the new signature first: the whole
    # point of the rebuild is to bring the corpus onto it.
    services.metadata.initialize()
    services.metadata.set_meta(EMBEDDING_SIGNATURE_KEY, services.signature)
    startup(services)

    print(f"Rebuilding {', '.join(collections)} with {services.signature}")
    print(f"  chunks: {services.metadata.stats()['chunk_count']}")
    if not args.yes:
        if input("This re-embeds every chunk and can take hours. Continue? [y/N] ").lower() != "y":
            print("Aborted.")
            shutdown(services)
            return 1

    # A database migrated from before the public/private id partition can hold
    # private chunks with public-range ids -- reachable by every public search.
    # Repairing them means reallocating ids, which is only safe as part of a full
    # rebuild, so it happens here and nowhere else.
    repartitioned = services.metadata.repartition_chunks()
    if repartitioned:
        print(f"Repartitioned {len(repartitioned)} chunk(s) onto correct id ranges")

    batch_size = args.batch_size or services.config.embed_batch_size

    # Drop the loaded indexes before rebuilding. They hold the *old* vectors in
    # memory, and letting shutdown flush them afterwards would write the stale
    # index straight back over the file this script just rebuilt.
    services.indexes.close()

    try:
        rebuild_collections(services, collections, batch_size, force=args.force)
    except RebuildRefused as exc:
        print(f"Refused: {exc}")
        return 1
    finally:
        shutdown(services)

    print("Done. Restart the API so it loads the rebuilt indexes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
