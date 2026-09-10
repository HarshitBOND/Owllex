"""Run a backup immediately, outside the scheduler.

    cd backend && .venv/bin/python -m rag.scripts.backup_now
    cd backend && .venv/bin/python -m rag.scripts.backup_now --documents

Use before a deploy, a schema change, or any bulk delete. Same code path the
nightly job runs, so a manual snapshot is identical to an automatic one.

By default the document trees follow the weekly cadence, so a mid-week manual run
snapshots SQLite, LMDB and FAISS only. ``--documents`` forces the full mirror --
which is what you want before anything that could delete files -- and
``--no-documents`` forces it off even on the weekly day, for a quick pre-deploy
snapshot of the metadata alone.
"""

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from rag.core.backup import run_backup
from rag.core.services import build_services, shutdown, startup


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--documents",
        dest="documents",
        action="store_true",
        default=None,
        help="Mirror the document trees even if this is not the weekly day",
    )
    group.add_argument(
        "--no-documents",
        dest="documents",
        action="store_false",
        help="Snapshot the metadata stores only",
    )
    parser.add_argument("--stamp", help="Snapshot directory name (default: today, UTC)")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(message)s")
    services = build_services()
    # Read-only: this process only ever copies the FAISS files on disk, never
    # decodes them into RAM or writes them. See PRODUCTION_TODO.md T2a --
    # loading them here is how a previous version of this script silently
    # rewound the live index to whatever it was when the backup started.
    startup(services, read_only=True)
    try:
        result = run_backup(services, args.stamp, include_documents=args.documents)
    finally:
        shutdown(services)

    print(f"Backup written to {result.directory} ({result.bytes_written / 1024 / 1024:.1f} MB)")
    for name, detail in result.components.items():
        print(f"  {name}: {detail}")
    if result.pruned:
        print(f"  pruned: {', '.join(result.pruned)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
