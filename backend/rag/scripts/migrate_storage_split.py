"""Move an existing single-volume deployment onto the SSD + HDD split.

Bulk, immutable data (the corpus, user documents, FAISS indexes, archives,
backups) moves to ``HDD_DATA_ROOT``. Latency-critical data (SQLite, LMDB) stays
on -- or moves to -- ``SSD_DATA_ROOT``. Nothing in the database changes: every
path SQLite stores is relative to a configured root, which is the whole reason
this can be a file move rather than a data migration.

    cd backend
    # See what would happen. Always run this first.
    .venv/bin/python -m rag.scripts.migrate_storage_split --plan

    # Do it, with the service stopped.
    sudo systemctl stop owllex
    .venv/bin/python -m rag.scripts.migrate_storage_split --apply
    sudo systemctl start owllex

**Stop the backend first.** Moving the SQLite file or the LMDB directory under a
running process leaves it writing to an unlinked inode: the writes succeed, and
they are gone at the next restart. The script refuses to touch those two while
something holds them open, but it cannot detect every case.

Copies first, verifies, and only then removes the source, so an interrupted run
leaves the original intact. Same-filesystem moves are renames and effectively
instant; cross-filesystem moves copy, which for a large corpus is bounded by
disk throughput -- budget accordingly.
"""

from __future__ import annotations

import argparse
import filecmp
import logging
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from rag.core.config import RagConfig, ensure_directories, get_config

logger = logging.getLogger("migrate_storage_split")


@dataclass(frozen=True)
class Move:
    """One directory or file to relocate."""

    name: str
    source: Path
    destination: Path
    tier: str

    @property
    def needed(self) -> bool:
        return self.source != self.destination and self.source.exists()


def plan_moves(config: RagConfig) -> list[Move]:
    """Where each store currently is, and where this config says it belongs.

    The source is derived from the *legacy* single-volume layout (everything
    under DATA_ROOT); the destination is whatever the current config resolves to.
    A store already in the right place is reported and skipped.
    """
    legacy = config.data_root
    candidates = [
        # ─── HDD: bulk, immutable, sequential ─────────────────────────────────
        Move("legal corpus", legacy / "legal_corpus", config.legal_corpus_root, "HDD"),
        Move("legal corpus (pre-rename)", legacy / "documents", config.legal_corpus_root, "HDD"),
        Move("user documents", legacy / "users", config.users_root, "HDD"),
        Move("FAISS indexes", legacy / "faiss", config.faiss_root, "HDD"),
        Move("private objects", legacy / "private", config.private_root, "HDD"),
        Move("archive", legacy / "archive", config.archive_root, "HDD"),
        Move("backups", legacy / "backups", config.backup_root, "HDD"),
        Move("inbox", legacy / "inbox", config.inbox_root, "HDD"),
        # ─── SSD: small, random-access, latency-critical ───────────────────────
        Move("SQLite database", legacy / "sqlite", config.sqlite_path.parent, "SSD"),
        Move("LMDB hash index", legacy / "lmdb", config.lmdb_path.parent, "SSD"),
    ]
    return [move for move in candidates if move.needed]


def _same_filesystem(a: Path, b: Path) -> bool:
    """Whether a rename would work, i.e. whether this move is instant."""
    try:
        return os.stat(_nearest_existing(a)).st_dev == os.stat(_nearest_existing(b)).st_dev
    except OSError:
        return False


def _nearest_existing(path: Path) -> Path:
    for candidate in [path, *path.parents]:
        if candidate.exists():
            return candidate
    return Path("/")


def _directory_size(path: Path) -> int:
    if path.is_file():
        return path.stat().st_size
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def _in_use(path: Path) -> bool:
    """Best-effort check that nothing has the SQLite or LMDB files open.

    Advisory only: lsof may not be installed, and a process on another mount
    namespace is invisible to it. It catches the common mistake -- forgetting to
    stop the service -- and nothing more, which is why the docstring says to stop
    the service rather than trusting this.
    """
    if shutil.which("lsof") is None:
        return False
    try:
        result = subprocess.run(
            ["lsof", "-t", "--", str(path)], capture_output=True, timeout=20, text=True
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return bool(result.stdout.strip())


def _verify(source: Path, destination: Path) -> None:
    """Confirm the copy is complete before the source is deleted."""
    if source.is_file():
        if not filecmp.cmp(source, destination, shallow=False):
            raise RuntimeError(f"Copy mismatch for {source}")
        return

    source_files = {p.relative_to(source) for p in source.rglob("*") if p.is_file()}
    destination_files = {p.relative_to(destination) for p in destination.rglob("*") if p.is_file()}
    missing = source_files - destination_files
    if missing:
        raise RuntimeError(f"{len(missing)} file(s) missing after copy, e.g. {sorted(missing)[:3]}")

    for relative in source_files:
        src_size = (source / relative).stat().st_size
        dst_size = (destination / relative).stat().st_size
        if src_size != dst_size:
            raise RuntimeError(f"Size mismatch for {relative}: {src_size} != {dst_size}")


def apply_move(move: Move, *, keep_source: bool = False) -> None:
    """Relocate one store: rename when possible, otherwise copy-verify-delete."""
    move.destination.parent.mkdir(parents=True, exist_ok=True)

    if move.destination.exists() and any(p.is_file() for p in move.destination.rglob("*")):
        raise RuntimeError(
            f"{move.name}: destination {move.destination} already exists and is not empty. "
            f"Merge it by hand, or move it aside, rather than risking a partial overlay."
        )

    if _same_filesystem(move.source, move.destination):
        logger.info("%s: renaming %s -> %s (same filesystem)", move.name, move.source, move.destination)
        if move.destination.exists():
            move.destination.rmdir()
        move.source.rename(move.destination)
        return

    size_mb = _directory_size(move.source) / 1024 / 1024
    logger.info(
        "%s: copying %s -> %s (%.1f MB, across filesystems)",
        move.name, move.source, move.destination, size_mb,
    )
    if move.source.is_file():
        shutil.copy2(move.source, move.destination)
    else:
        shutil.copytree(move.source, move.destination, dirs_exist_ok=True, symlinks=True)

    _verify(move.source, move.destination)
    logger.info("%s: verified", move.name)

    if keep_source:
        logger.info("%s: leaving the source in place (--keep-source)", move.name)
        return
    if move.source.is_file():
        move.source.unlink()
    else:
        shutil.rmtree(move.source)
    logger.info("%s: source removed", move.name)


def _print_plan(config: RagConfig, moves: list[Move]) -> None:
    print(f"SSD_DATA_ROOT : {config.ssd_data_root}")
    print(f"HDD_DATA_ROOT : {config.hdd_data_root}")
    if not config.storage_is_split:
        print(
            "\nBoth tiers resolve to the same directory, so there is nothing to split.\n"
            "Set SSD_DATA_ROOT and HDD_DATA_ROOT in backend/.env first."
        )
        return
    if not moves:
        print("\nEverything is already in the right place.")
        return

    print(f"\n{len(moves)} store(s) to move:\n")
    for move in moves:
        instant = "rename" if _same_filesystem(move.source, move.destination) else "copy"
        size_mb = _directory_size(move.source) / 1024 / 1024
        print(f"  [{move.tier}] {move.name}")
        print(f"        {move.source}")
        print(f"     -> {move.destination}   ({size_mb:,.1f} MB, {instant})")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--plan", action="store_true", help="Show what would move, change nothing")
    group.add_argument("--apply", action="store_true", help="Perform the moves")
    parser.add_argument(
        "--keep-source",
        action="store_true",
        help="Copy without deleting the original (needs double the space)",
    )
    parser.add_argument("--force", action="store_true", help="Skip the in-use check")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(message)s")
    config = get_config()
    moves = plan_moves(config)

    if args.plan:
        _print_plan(config, moves)
        return 0

    if not config.storage_is_split:
        print("SSD_DATA_ROOT and HDD_DATA_ROOT resolve to the same directory; nothing to do.")
        return 1
    if not moves:
        print("Everything is already in the right place.")
        return 0

    # SQLite and LMDB are the two that corrupt silently if moved while open.
    if not args.force:
        for move in moves:
            if move.tier == "SSD" and _in_use(move.source):
                print(
                    f"{move.source} is open by another process. Stop the backend "
                    f"(systemctl stop owllex) and retry, or pass --force if you are sure."
                )
                return 1

    _print_plan(config, moves)
    if input("\nProceed? [y/N] ").strip().lower() != "y":
        print("Aborted.")
        return 1

    # Moves run before ensure_directories, not after: creating the destination
    # layout first would leave (for instance) $SSD/lmdb/hashdb sitting in the
    # place $OLD/lmdb is about to be renamed to, and every move would then refuse
    # to overlay a non-empty directory.
    for move in moves:
        apply_move(move, keep_source=args.keep_source)
    ensure_directories(config)

    print("\nDone. Start the backend and confirm with:")
    print("  .venv/bin/python rag/scripts/verify_rag.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
