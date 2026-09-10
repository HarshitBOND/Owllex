"""Upgrade LMDB hash values from bare document ids to the JSON entry format.

Old value:  ``"3c93475d8dc64030b167bb54b8f6f683"``
New value:  ``{"document_id": "...", "file_path": "...", "court": "..."}``

Reading a legacy value already works (see :meth:`HashEntry.parse`), so this is
not required for correctness -- it backfills ``file_path`` and ``court`` from
SQLite so the hash index alone can answer "where is this document" without a
join, which is what the duplicate-detection path in bulk imports uses.

    cd backend
    .venv/bin/python -m rag.scripts.migrate_hash_values [--dry-run]
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from rag.core.hash_index import HashEntry
from rag.core.services import build_services, shutdown, startup


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Report without writing")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(message)s")
    services = build_services()
    startup(services)

    upgraded = skipped = orphaned = 0
    try:
        with services.hashes.env.begin() as txn:
            entries = [(bytes(k), bytes(v)) for k, v in txn.cursor()]

        for key, raw in entries:
            entry = HashEntry.parse(raw)
            if entry.file_path is not None and entry.court is not None:
                skipped += 1
                continue

            record = services.metadata.get_document(entry.document_id)
            if record is None:
                # A hash with no document row: ingested before SQLite existed,
                # or its document was deleted. Left alone -- it still does its
                # job as a dedup marker.
                orphaned += 1
                continue

            if not args.dry_run:
                services.hashes.put(
                    key.decode(),
                    document_id=entry.document_id,
                    file_path=record.file_path,
                    court=record.court,
                )
            upgraded += 1
    finally:
        shutdown(services)

    verb = "would upgrade" if args.dry_run else "upgraded"
    print(f"{verb} {upgraded}, already current {skipped}, no matching document {orphaned}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
