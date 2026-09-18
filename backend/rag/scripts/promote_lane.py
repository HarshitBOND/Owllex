"""Promote a lexical-lane document into the dense lane, without re-ingesting.

PRODUCTION_TODO.md T14 routes each document into the lexical (FTS5-only) or
dense (embedded + FTS5) lane by a fixed rules table applied once at ingest, on
purpose not a trained classifier: a wrong call must be correctable without a
training set, a model version, or a re-run of the whole ingest pipeline.

Every chunk gets a FAISS id at ingest regardless of lane -- ``chunks.faiss_id``
is ``NOT NULL UNIQUE``, see ``rag/core/sqlite_store.py`` -- but a lexical-lane
id is never added to the index. Promotion is exactly that: read the chunk text
already sitting in SQLite, embed it now, and add it to the index under the id
it already holds. No id is reallocated and nothing is re-parsed or re-chunked.

    cd backend
    .venv/bin/python -m rag.scripts.promote_lane DOC_ID [DOC_ID ...]
    .venv/bin/python -m rag.scripts.promote_lane --court sci --court hc/delhi
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from rag.app.ingest.pipeline import LANE_DENSE, LANE_LEXICAL
from rag.core.services import build_services, shutdown, startup

logger = logging.getLogger("promote_lane")


def promote_document(services, document_id: str) -> int:
    """Embed and index one lexical-lane document's existing chunks.

    Returns how many chunks were added to the index -- 0 if the document does
    not exist, is already dense, or (should not happen, but is not this
    script's job to repair) has no chunk rows.
    """
    document = services.metadata.get_document(document_id)
    if document is None:
        logger.warning("%s: no such document", document_id)
        return 0
    if document.lane != LANE_LEXICAL:
        logger.info("%s: already %s, nothing to do", document_id, document.lane)
        return 0

    chunks = services.metadata.chunks_for_document(document_id)
    if not chunks:
        logger.warning("%s: lexical but has no chunks; nothing to embed", document_id)
        return 0

    faiss_ids = [faiss_id for faiss_id, _text in chunks]
    vectors = services.embedder.embed_documents([text for _faiss_id, text in chunks])

    index = services.indexes.get(document.collection)
    index.add(faiss_ids, vectors)

    services.metadata.set_lane(document_id, LANE_DENSE, f"promoted:{document.lane_reason}")
    logger.info("%s: promoted %d chunk(s)", document_id, len(chunks))
    return len(chunks)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("document_id", nargs="*", help="Document ids to promote")
    parser.add_argument(
        "--court",
        action="append",
        default=[],
        help="Promote every lexical-lane document with this court code (repeatable)",
    )
    args = parser.parse_args()

    if not args.document_id and not args.court:
        parser.error("Pass one or more document ids, or --court")

    services = build_services()
    startup(services)
    try:
        document_ids = list(args.document_id)
        for court in args.court:
            found = services.metadata.lexical_document_ids(court=court)
            logger.info("court=%s: %d lexical-lane document(s)", court, len(found))
            document_ids.extend(found)

        promoted_chunks = 0
        promoted_documents = 0
        for document_id in document_ids:
            count = promote_document(services, document_id)
            if count:
                promoted_documents += 1
                promoted_chunks += count

        print(
            f"Promoted {promoted_documents}/{len(document_ids)} document(s), "
            f"{promoted_chunks} chunk(s) total"
        )
    finally:
        shutdown(services)
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(message)s")
    raise SystemExit(main())
