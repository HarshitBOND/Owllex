"""Rebuild ``chunks.db`` at the configured ``SQLITE_PAGE_SIZE``.

PRODUCTION_TODO.md T18. SQLite only honours ``PRAGMA page_size`` on a database
that has no tables yet and is not already in WAL mode (see
``SqliteStore._connect``) -- once either is true, the pragma is silently
ignored for the rest of that connection's life, and there is no ``ALTER``
that changes it after the fact. The only way to change the page size of a
database that already holds data is to rebuild it: set the pragma on a fresh
connection, then ``VACUUM``.

This uses ``VACUUM INTO`` rather than an in-place ``VACUUM`` so the rebuilt
copy is written to a temporary file and the live file is only touched by one
atomic ``os.replace`` at the very end -- the same swap-on-success shape
``rebuild_index.py`` and ``build_index.py`` use for the FAISS side of this
migration. A run that fails or is interrupted midway leaves the live database
completely untouched.

**Downtime.** Both ``owllex-rag`` and ``owllex-ingest`` must be stopped before
running this. ``VACUUM INTO`` takes a consistent read snapshot of the
database *at the moment it starts* -- through the normal SQL layer, so it
correctly includes anything already committed to the WAL, not just the main
file -- but it cannot see a write committed *after* it starts. If either
service is still running and writes during the rebuild, that write exists in
the live file when this script swaps its rebuilt copy in, and is silently
discarded. Expect this to take roughly as long as reading the whole database
at disk speed plus writing a full copy of it -- for a multi-GB database that
is minutes, not seconds; size the maintenance window to the real corpus, not
to how fast this runs against the tiny database in this script's own test.

Usage::

    cd backend
    systemctl stop owllex-ingest owllex-rag   # or the dev equivalent
    .venv/bin/python -m rag.scripts.vacuum_page_size            # rebuild
    .venv/bin/python -m rag.scripts.vacuum_page_size --dry-run  # report only
"""

from __future__ import annotations

import argparse
import logging
import os
import sqlite3
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from rag.core.config import get_config

logger = logging.getLogger("vacuum_page_size")


class MigrationFailed(RuntimeError):
    """The rebuilt copy did not check out; the live database was not touched."""


def current_page_size(path: Path) -> int:
    conn = sqlite3.connect(str(path))
    try:
        return int(conn.execute("PRAGMA page_size").fetchone()[0])
    finally:
        conn.close()


def _table_counts(conn: sqlite3.Connection) -> dict[str, int]:
    """Row counts for the tables that matter, cheap enough to run twice.

    Not a substitute for a real backup-and-restore drill -- just the same
    "does the rebuilt copy look like the source" sanity check
    ``rebuild_index.py`` applies to a rebuilt FAISS index before trusting it.
    """
    counts = {}
    for table in ("documents", "chunks", "meta"):
        try:
            counts[table] = int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
        except sqlite3.OperationalError:
            # A table that doesn't exist yet (fresh/empty database) -- not an
            # error, just nothing to count.
            counts[table] = 0
    return counts


def rebuild_at_page_size(path: Path, target_page_size: int) -> None:
    """Rebuild ``path`` at ``target_page_size`` via VACUUM INTO, then swap it in.

    Raises :class:`MigrationFailed` (leaving the live file untouched) if the
    rebuilt copy fails an integrity check or its row counts don't match the
    source.
    """
    tmp_path = path.with_suffix(".page_size_migration.tmp")
    if tmp_path.exists():
        tmp_path.unlink()

    source = sqlite3.connect(str(path))
    try:
        before_counts = _table_counts(source)
        source.execute(f"PRAGMA page_size={target_page_size}")
        # VACUUM INTO honours the page_size just set on *this* connection for
        # the target file, the same rule PRAGMA page_size follows for a fresh
        # database -- it does not touch `path` itself.
        source.execute("VACUUM INTO ?", (str(tmp_path),))
    finally:
        source.close()

    verify = sqlite3.connect(str(tmp_path))
    try:
        ok = verify.execute("PRAGMA quick_check").fetchone()[0]
        if ok != "ok":
            raise MigrationFailed(f"Rebuilt database failed PRAGMA quick_check: {ok}")
        new_page_size = int(verify.execute("PRAGMA page_size").fetchone()[0])
        if new_page_size != target_page_size:
            raise MigrationFailed(
                f"Rebuilt database reports page_size {new_page_size}, expected {target_page_size}"
            )
        after_counts = _table_counts(verify)
    finally:
        verify.close()

    if after_counts != before_counts:
        raise MigrationFailed(
            f"Row counts changed across the rebuild: before={before_counts} after={after_counts}. "
            "This should be impossible for VACUUM INTO against a quiescent database -- if you see "
            "this, a writer was almost certainly still running. Stop owllex-rag and owllex-ingest "
            "and try again."
        )

    os.replace(tmp_path, path)
    # These belong to the file that path used to point at -- os.replace swaps
    # the directory entry, so `path`'s inode is now the rebuilt copy and any
    # leftover -wal/-shm sidecars are stale journal state for content that no
    # longer exists there. SQLite would actually detect the mismatch and
    # discard them on its own (their header salt won't match the new file),
    # but there is no reason to leave stale files sitting next to a live
    # database when removing them is one line.
    for suffix in ("-wal", "-shm"):
        stale = Path(str(path) + suffix)
        if stale.exists():
            stale.unlink()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--dry-run", action="store_true", help="Report the current and target page size; change nothing"
    )
    parser.add_argument(
        "--yes", action="store_true", help="Skip the confirmation prompt"
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(message)s")

    config = get_config()
    path = config.sqlite_path
    if not path.exists():
        print(f"{path} does not exist yet -- nothing to migrate. It will be created at "
              f"page_size={config.sqlite_page_size} on first boot.")
        return 0

    current = current_page_size(path)
    target = config.sqlite_page_size
    print(f"{path}: current page_size={current}, configured SQLITE_PAGE_SIZE={target}")

    if current == target:
        print("Already at the configured page size. Nothing to do.")
        return 0

    if args.dry_run:
        print("--dry-run: would rebuild via VACUUM INTO and swap the result in. No changes made.")
        return 0

    print(
        "This rebuilds the whole database at the new page size. owllex-rag and "
        "owllex-ingest must both be stopped first -- see this script's module docstring. "
        "A write to chunks.db while this runs is silently lost."
    )
    if not args.yes:
        if input("Both services stopped. Continue? [y/N] ").lower() != "y":
            print("Aborted.")
            return 1

    start = time.monotonic()
    try:
        rebuild_at_page_size(path, target)
    except MigrationFailed as exc:
        print(f"Refused: {exc}")
        print(f"{path} was not modified.")
        return 1
    elapsed = time.monotonic() - start

    print(f"Rebuilt {path} at page_size={target} in {elapsed:.1f}s.")
    print("Restart owllex-rag and owllex-ingest.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
