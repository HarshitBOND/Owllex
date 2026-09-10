"""Nightly backups of every persistent store, including the document archive.

    /data/backups/2026-09-09/
        faiss/         lexvert.faiss, lexvert.meta.json, ...
        sqlite/        chunks.db
        lmdb/          data.mdb
        legal_corpus/  sci/2026/<sha256>.pdf, hc/delhi/2026/...   (weekly)
        users/         <owner>/contracts/<uuid>.pdf                (weekly)
        MANIFEST.json

**Two cadences.** The three small stores are snapshotted every night: they are
seconds of work, they are what a restore needs first, and they are the ones that
change on every single ingest. The two document trees are mirrored weekly,
because their contents are immutable once written -- a corpus PDF is
content-addressed and a user document is never rewritten in place -- so a nightly
walk of millions of files would spend hours proving that nothing changed. Set
``BACKUP_WEEKLY_WEEKDAY`` to choose the day; the first run on a fresh backup root
always mirrors, whatever day it is, so a new deployment is never a week away from
having a copy of its documents.

Each store is snapshotted with the mechanism that stays consistent while it is
being written to: SQLite's ``VACUUM INTO`` (a real online backup, not a file copy
of a database with a live WAL), LMDB's compacting environment copy, and a plain
copy of the FAISS files, which are only ever replaced atomically.

**Documents are mirrored incrementally, not re-copied.** The archive is the bulk
of the volume by orders of magnitude, so a full copy would fill the disk within
weeks. Instead each mirror is an rsync with ``--link-dest`` pointing at the most
recent snapshot that holds the same tree: a PDF that has not changed becomes a
*hard link* to that copy rather than a second set of blocks on disk. The result
is that every dated directory reads as a complete, browsable,
restore-from-anything tree, while the marginal cost of a run is only the
documents actually added since the last one.

That works precisely because the archive is content-addressed and immutable: a
given path's bytes never change, so a hard link can never make an old snapshot
observe a new edit. Deletions are honoured with ``--delete``, which drops the
file from the newest snapshot only -- older snapshots still hold their own link
to it and keep the blocks alive until the last one is pruned.

Runs are resumable. rsync is invoked with ``--partial`` so a transfer killed
mid-file resumes rather than restarting, and re-running a stamp reuses the
snapshot directory instead of wiping it, so an interrupted nightly job picks up
where it stopped rather than re-walking a terabyte.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import sqlite3
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from .services import RagServices

logger = logging.getLogger("ravenslaw.rag.backup")


@dataclass(frozen=True)
class BackupResult:
    """What one run produced."""

    directory: Path
    bytes_written: int
    components: dict[str, str]
    pruned: list[str]
    documents_linked: int = 0
    documents_copied: int = 0
    trees: dict[str, dict] = field(default_factory=dict)
    """Per-tree mirror counts, keyed by snapshot subdirectory. Empty on a nightly
    run that did not reach the weekly cadence."""

    def to_dict(self) -> dict:
        """Serialisable summary -- written to MANIFEST.json and returned by the API."""
        return {
            "directory": str(self.directory),
            "stamp": self.directory.name,
            "bytes_written": self.bytes_written,
            "components": dict(self.components),
            "pruned": list(self.pruned),
            "documents_linked": self.documents_linked,
            "documents_copied": self.documents_copied,
            "trees": {name: dict(counts) for name, counts in self.trees.items()},
        }


MANIFEST_NAME = "MANIFEST.json"

# Written last, and only on success. Its presence is what distinguishes a
# complete snapshot from a directory an interrupted run left half-populated --
# restore.sh refuses a snapshot without one unless forced.
_COMPLETE_MARKER = MANIFEST_NAME


# Snapshot subdirectory names for the two document trees, paired with the config
# attribute holding their source. ``legacy`` is the name a pre-rename snapshot
# used, and is accepted as a hard-link source so the first mirror after the
# rename does not re-copy the entire corpus.
_TREES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("legal_corpus", "legal_corpus_root", ("legal_corpus", "documents")),
    ("users", "users_root", ("users",)),
)


def run_backup(
    services: RagServices,
    stamp: str | None = None,
    *,
    include_documents: bool | None = None,
    flush_faiss: bool = False,
) -> BackupResult:
    """Snapshot FAISS, SQLite, LMDB and the document archive into one directory.

    Re-running the same stamp resumes rather than restarts: the three small
    stores are re-snapshotted (they are seconds of work and always want to be the
    freshest available), while the document mirror picks up where the previous
    attempt stopped. That is what makes a nightly job survive a reboot in the
    middle of a large import.

    ``flush_faiss`` defaults to False on purpose (PRODUCTION_TODO.md T2a): this
    function runs in processes that do not own the index -- ``backup_now.py``
    opens the stack read-only, and even the in-process APScheduler job inside
    ``owllex-rag`` never writes FAISS post-T2, since the ingest worker is the
    sole writer. Flushing here writes *this* process's in-memory snapshot over
    the live file, which silently rewinds every vector a real writer added
    since this process loaded it. Only pass True from a process that is
    itself, at this moment, the confirmed sole writer.
    """
    config = services.config
    now = datetime.now(timezone.utc)
    stamp = stamp or now.strftime("%Y-%m-%d")
    destination = config.backup_root / stamp

    # Resolved *before* the destination is created, so a same-day re-run does not
    # pick itself as its own link source.
    previous = _previous_snapshot(config.backup_root, stamp)

    destination.mkdir(parents=True, exist_ok=True)
    # Drop any stale manifest up front: until this run finishes, the directory is
    # explicitly not a complete snapshot.
    _unlink(destination / MANIFEST_NAME)

    components: dict[str, str] = {}
    components["faiss"] = _backup_faiss(services, destination / "faiss", flush=flush_faiss)
    components["sqlite"] = _backup_sqlite(services, destination / "sqlite")
    components["lmdb"] = _backup_lmdb(services, destination / "lmdb")

    linked = copied = 0
    trees: dict[str, dict] = {}

    for name, attribute, link_names in _TREES:
        enabled = config.backup_documents if name == "legal_corpus" else config.backup_users
        flag = "BACKUP_DOCUMENTS" if name == "legal_corpus" else "BACKUP_USERS"
        if not enabled:
            components[name] = f"skipped ({flag}=false)"
            continue

        due = include_documents
        if due is None:
            due = _weekly_mirror_due(config, stamp, name, link_names, now)
        if not due:
            components[name] = "skipped (not the weekly mirror day)"
            continue

        summary, tree_linked, tree_copied = _backup_tree(
            services,
            source=getattr(config, attribute),
            destination=destination / name,
            link_dest=_link_dest(config.backup_root, stamp, link_names),
        )
        components[name] = summary
        trees[name] = {"linked": tree_linked, "copied": tree_copied}
        linked += tree_linked
        copied += tree_copied

    # The old key, kept so an operator's dashboard and restore.sh keep parsing.
    components.setdefault("documents", components.get("legal_corpus", "skipped"))

    # Apparent size, counting a hard-linked PDF at full size. That is the number
    # a restore has to be able to write, which is what makes it the useful one to
    # report; `du -sh --exclude=documents` gives the marginal cost on disk.
    total = sum(f.stat().st_size for f in destination.rglob("*") if f.is_file())
    pruned = prune_backups(config.backup_root, config.backup_retention_days)

    result = BackupResult(
        directory=destination,
        bytes_written=total,
        components=components,
        pruned=pruned,
        documents_linked=linked,
        documents_copied=copied,
        trees=trees,
    )
    _write_manifest(services, result, previous)

    logger.info(
        "Backup %s complete (%.1f MB apparent, %d document(s) copied, %d linked) -> %s%s",
        stamp, total / 1024 / 1024, copied, linked, destination,
        f"; pruned {len(pruned)} old snapshot(s)" if pruned else "",
    )
    return result


def _previous_snapshot(root: Path, stamp: str) -> Path | None:
    """Newest complete snapshot older than ``stamp``.

    Recorded in the manifest as this run's predecessor. Only complete snapshots
    qualify -- one killed before it wrote its manifest describes a tree with
    unknown gaps, and naming it as the predecessor would suggest a continuity
    that does not exist.

    Which snapshot is actually hard-linked against is :func:`_link_dest`'s
    decision, and it is usually a different (older) one, because the document
    trees are mirrored weekly while this runs nightly.
    """
    return _newest_snapshot(root, stamp, lambda snapshot: True)


def _newest_snapshot(root: Path, stamp: str, predicate) -> Path | None:
    """Newest complete snapshot older than ``stamp`` that satisfies ``predicate``."""
    if not root.exists():
        return None
    candidates = sorted(
        (
            p for p in root.iterdir()
            if p.is_dir()
            and _looks_like_stamp(p.name)
            and p.name < stamp
            and (p / _COMPLETE_MARKER).exists()
            and predicate(p)
        ),
        key=lambda p: p.name,
        reverse=True,
    )
    return candidates[0] if candidates else None


def _backup_faiss(services: RagServices, destination: Path, *, flush: bool = False) -> str:
    """Copy the index files as last flushed -- optionally flushing first.

    The index is replaced atomically (`os.replace` in `VectorIndex.flush`), so
    a plain copy of whatever is on disk is already a consistent snapshot; a
    rebuild (`rag/scripts/rebuild_index.py`) is the tool for "as of right now"
    if what was last flushed is stale. See `run_backup` for why `flush`
    defaults to False.
    """
    destination.mkdir(parents=True, exist_ok=True)
    if flush:
        services.indexes.flush_all()

    copied = 0
    root = services.config.faiss_root
    if root.exists():
        for path in sorted(root.iterdir()):
            # Skip half-written indexes from an interrupted flush (.tmp) and
            # staging files from an in-progress rebuild -- neither is a
            # consistent snapshot of anything.
            if not path.is_file() or path.suffix == ".tmp" or ".rebuild." in path.name:
                continue
            shutil.copy2(path, destination / path.name)
            copied += 1
    return f"{copied} file(s)"


def _backup_sqlite(services: RagServices, destination: Path) -> str:
    """Online backup via VACUUM INTO -- consistent without stopping writers.

    Copying the .db file directly would miss the WAL and could capture a torn
    page mid-transaction; VACUUM INTO takes a read snapshot and writes a
    complete, already-compacted database.
    """
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / services.config.sqlite_path.name
    if target.exists():
        target.unlink()

    connection = sqlite3.connect(services.config.sqlite_path)
    try:
        connection.execute("VACUUM INTO ?", (str(target),))
    finally:
        connection.close()
    return f"{target.stat().st_size} bytes"


def _backup_lmdb(services: RagServices, destination: Path) -> str:
    """Compacting copy of the hash index, safe against concurrent writes."""
    # LMDB's copy refuses to overwrite an existing data.mdb, so a resumed run has
    # to clear the previous attempt's file first.
    if destination.exists():
        shutil.rmtree(destination)
    services.hashes.snapshot(destination)
    size = sum(p.stat().st_size for p in destination.iterdir() if p.is_file())
    return f"{size} bytes"


def _weekly_mirror_due(
    config, stamp: str, name: str, link_names: tuple[str, ...], now: datetime
) -> bool:
    """Whether this run should mirror ``name``.

    True on the configured weekday, and true whenever no earlier snapshot holds
    the tree at all. That second case is what stops a fresh deployment -- or one
    whose backup root was just rotated -- from going up to six days with backups
    that contain the metadata but none of the documents it describes.
    """
    if _link_dest(config.backup_root, stamp, link_names) is None:
        logger.info("No previous %s mirror found; running it regardless of the weekly day", name)
        return True

    try:
        weekday = datetime.strptime(stamp, "%Y-%m-%d").weekday()
    except ValueError:
        weekday = now.weekday()
    return weekday == config.backup_weekly_weekday


def _link_dest(root: Path, stamp: str, names: tuple[str, ...]) -> Path | None:
    """Newest earlier snapshot holding one of ``names``, to hard-link against.

    Not simply "yesterday": with a weekly cadence the previous snapshot usually
    has no document tree at all, and linking against a missing directory would
    silently re-copy the entire archive. Older names are accepted too, so the
    first mirror after the ``documents/`` -> ``legal_corpus/`` rename links to
    the old directory instead of duplicating a terabyte.

    Only *complete* snapshots qualify. Hard-linking against a tree a killed run
    left half-written would carry its gaps forward into every snapshot after it,
    and nothing later would notice: each one would look complete on its own.
    """
    snapshot = _newest_snapshot(
        root, stamp, lambda candidate: any((candidate / name).is_dir() for name in names)
    )
    if snapshot is None:
        return None
    for name in names:
        tree = snapshot / name
        if tree.is_dir():
            return tree
    return None


def _backup_tree(
    services: RagServices, *, source: Path, destination: Path, link_dest: Path | None
) -> tuple[str, int, int]:
    """Incrementally mirror one document tree into this snapshot.

    Returns ``(summary, linked, copied)``. Unchanged files become hard links into
    the previous mirror, so the cost of a run is the documents actually added
    since it rather than the whole tree.
    """
    config = services.config
    if not source.exists():
        return "no source directory", 0, 0

    destination.mkdir(parents=True, exist_ok=True)
    # The mirror of the private tree inherits its permissions from --archive, but
    # the snapshot directory itself is created by this process: without this the
    # umask decides whether a backup of 0700 user directories sits under a
    # world-traversable parent.
    try:
        destination.chmod(0o700)
    except OSError as exc:
        logger.warning("Could not tighten backup directory %s: %s", destination, exc)

    if not config.backup_documents_link_dest:
        link_dest = None

    if shutil.which(config.rsync_binary):
        return _rsync_documents(config.rsync_binary, source, destination, link_dest)

    logger.warning(
        "%s not found on PATH -- falling back to the Python mirror, which is slower "
        "and cannot resume mid-file. Install rsync (deploy/deploy.sh does).",
        config.rsync_binary,
    )
    return _python_mirror(source, destination, link_dest)


def _rsync_documents(
    binary: str, source: Path, destination: Path, link_dest: Path | None
) -> tuple[str, int, int]:
    """rsync the archive, hard-linking everything unchanged since ``link_dest``."""
    command = [
        binary,
        "--archive",       # recurse, preserving times/permissions/symlinks
        "--delete",        # documents removed from the corpus leave the newest snapshot
        "--partial",       # a killed transfer resumes this file instead of restarting
        "--numeric-ids",
        "--stats",
    ]
    if link_dest is not None:
        command.append(f"--link-dest={link_dest.resolve()}")
    # Trailing slashes: copy the *contents* of source into destination.
    command += [f"{source}/", f"{destination}/"]

    logger.info("Mirroring documents: %s", " ".join(command))
    completed = subprocess.run(command, capture_output=True, text=True)

    # 24 is "source files vanished during transfer" -- an ingest completing while
    # the backup walks the tree, which is expected on a live box and not a
    # failure: the file is simply picked up by tomorrow's snapshot.
    if completed.returncode not in (0, 24):
        raise RuntimeError(
            f"rsync failed with code {completed.returncode}: {completed.stderr.strip()[:500]}"
        )
    if completed.returncode == 24:
        logger.info("rsync reported vanished source files; they will be captured next run")

    copied, total = _parse_rsync_stats(completed.stdout)
    linked = max(total - copied, 0)
    return f"{copied} copied, {linked} linked", linked, copied


def _parse_rsync_stats(output: str) -> tuple[int, int]:
    """Pull (regular files transferred, total regular files) out of --stats.

    Counts are advisory -- they land in the log line and the manifest, never in a
    control-flow decision -- so an unparsed line degrades to 0 rather than
    failing a backup that has already been written correctly.
    """
    copied = total = 0
    for line in output.splitlines():
        if line.startswith("Number of regular files transferred:"):
            copied = _first_int(line)
        elif line.startswith("Number of files:"):
            # "Number of files: 1,234 (reg: 1,200, dir: 34)"
            match = re.search(r"reg:\s*([\d,]+)", line)
            total = int(match.group(1).replace(",", "")) if match else _first_int(line)
    return copied, total


def _first_int(text: str) -> int:
    """First integer in ``text``, tolerating rsync's thousands separators."""
    match = re.search(r"([\d][\d,]*)", text)
    return int(match.group(1).replace(",", "")) if match else 0


def _python_mirror(
    source: Path, destination: Path, link_dest: Path | None
) -> tuple[str, int, int]:
    """rsync-free fallback: hard-link what is unchanged, copy what is not.

    Deliberately not a full rsync replacement -- it does not delete files removed
    from the corpus and it cannot resume a partially written file. It exists so a
    box without rsync still gets a usable snapshot rather than none.
    """
    linked = copied = 0
    for path in source.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(source)
        target = destination / relative
        if target.exists():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)

        candidate = (link_dest / relative) if link_dest is not None else None
        if candidate is not None and candidate.is_file() and _same_file(candidate, path):
            try:
                os.link(candidate, target)
                linked += 1
                continue
            except OSError:
                # Cross-device, or the link count ceiling -- fall through to a copy.
                pass
        try:
            shutil.copy2(path, target)
            copied += 1
        except FileNotFoundError:
            # Ingest deleted it mid-walk. Tomorrow's run will settle it.
            continue
    return f"{copied} copied, {linked} linked", linked, copied


def _same_file(a: Path, b: Path) -> bool:
    """Size-and-mtime equality, the same test rsync makes without --checksum."""
    try:
        sa, sb = a.stat(), b.stat()
    except OSError:
        return False
    return sa.st_size == sb.st_size and int(sa.st_mtime) == int(sb.st_mtime)


def _write_manifest(services: RagServices, result: BackupResult, previous: Path | None) -> None:
    """Record what this snapshot contains. Written last: it marks completion.

    restore.sh reads it to check the snapshot finished and to warn when the
    embedding signature in the backup does not match the running configuration.
    """
    config = services.config
    payload = result.to_dict()
    payload.update(
        {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "link_dest": previous.name if previous else None,
            "embedding_signature": services.signature,
            "embed_model": config.embed_model,
            "embed_dim": config.embed_dim,
            "faiss_index_factory": config.faiss_index_factory,
            "source_roots": {
                "legal_corpus_root": str(config.legal_corpus_root),
                "users_root": str(config.users_root),
                # Legacy alias, still read by older copies of restore.sh.
                "pdf_root": str(config.legal_corpus_root),
                "faiss_root": str(config.faiss_root),
                "sqlite_path": str(config.sqlite_path),
                "lmdb_path": str(config.lmdb_path),
            },
        }
    )
    (result.directory / MANIFEST_NAME).write_text(json.dumps(payload, indent=2) + "\n")


def _unlink(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass


def prune_backups(root: Path, retention_days: int) -> list[str]:
    """Delete all but the newest ``retention_days`` snapshots.

    Counts snapshots rather than ages them: a box that was off for a week should
    still keep its last good backups instead of expiring every one of them the
    moment it comes back.

    The newest snapshot holding each document tree is kept whatever the count
    says. The trees are mirrored weekly and the nightly stores daily, so with a
    retention shorter than the weekly interval a naive count would delete the
    only copy of the documents while dutifully keeping seven copies of the
    database that indexes them -- a backup set that restores to a catalogue of
    files that are gone.
    """
    if not root.exists():
        return []

    snapshots = sorted(
        (p for p in root.iterdir() if p.is_dir() and _looks_like_stamp(p.name)),
        key=lambda p: p.name,
        reverse=True,
    )

    protected: set[str] = set()
    for _, _, link_names in _TREES:
        for snapshot in snapshots:
            if any((snapshot / name).is_dir() for name in link_names):
                protected.add(snapshot.name)
                break

    # Pruning the oldest snapshot only frees the blocks no newer snapshot still
    # links to, which is the whole point of --link-dest: retention stays cheap.
    pruned: list[str] = []
    for stale in snapshots[retention_days:]:
        if stale.name in protected:
            logger.info(
                "Keeping %s past retention: it holds the newest document mirror", stale.name
            )
            continue
        shutil.rmtree(stale, ignore_errors=True)
        pruned.append(stale.name)
    return pruned


def _looks_like_stamp(name: str) -> bool:
    try:
        datetime.strptime(name[:10], "%Y-%m-%d")
    except ValueError:
        return False
    return True
