"""Corpus ingest worker: drains /data/inbox, then resumes anything half-done.

    .venv/bin/python -m rag.scripts.ingest_worker            # run forever (systemd)
    .venv/bin/python -m rag.scripts.ingest_worker --once     # single pass, then exit
    .venv/bin/python -m rag.scripts.ingest_worker --inbox /mnt/import

This is what ``owllex-ingest.service`` runs, and it exists because bulk corpus
loading does not belong in the API process. A 50,000-document import through the
HTTP routes ties up a uvicorn worker for days, competes with user queries for the
same embedding model, and loses its place entirely on a deploy. Here it is a
separate unit with its own lifecycle: restart it, stop it during a migration, or
give it a different nice level, none of which touches the API.

**Dropping documents in.** Copy files (or whole directory trees) into
``INBOX_ROOT``. Layout under it is free-form, with one convention: a top-level
directory name that matches a known court is used as the court hint, so

    /data/inbox/sci/2019/whatever.pdf

is filed as a Supreme Court document. Everything else falls back to whatever the
metadata extractor finds in the document itself.

**After a successful ingest the inbox copy is deleted.** The archived copy under
PDF_ROOT is the durable one and it is content-addressed, so keeping the inbox
copy would just be a second full corpus on the same volume. Files that fail are
moved to ``INBOX_ROOT/.failed/`` rather than retried forever -- a PDF that
crashes the parser would otherwise wedge the queue behind it on every pass.

**Crash safety** comes from the pipeline, not from here: LMDB is written last, so
a document interrupted at any earlier stage is simply absent from the hash index
and gets re-ingested on the next pass. That is also why a stale ``.failed`` file
can be moved back into the inbox and safely retried after a fix.

**This is the only process that writes FAISS** (see PRODUCTION_TODO.md T2). The
API never runs the pipeline inline: ``POST /api/v1/rag/ingest`` and
``/corpus/ingest`` spool their upload into ``INBOX_ROOT/api/<job_id>/`` next to
a ``job.manifest.json`` describing the target document id, collection and
metadata, and return ``job_id`` immediately. A pass here recognises such a
directory by that manifest, runs the pipeline with the fields it specifies
instead of the usual path-derived defaults, and records the outcome in the
``ingest_jobs`` table so the API can answer a caller polling that job_id.
Everything else about the file -- settle wait, crash safety, quarantine on
failure -- is identical to an organic drop.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import signal
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.logging_setup import configure_logging  # noqa: E402
from rag.core.paths import resolve_court, UNKNOWN_COURT  # noqa: E402
from rag.core.services import build_services, shutdown, startup  # noqa: E402
from rag.core.vector_index import PUBLIC_COLLECTION  # noqa: E402

logger = logging.getLogger("ravenslaw.rag.ingest_worker")

# Extensions the pipeline can parse. Anything else (a .csv manifest, a .DS_Store,
# a stray .json) is left in place rather than failed -- an unrecognised file
# beside a batch is not an error, and quarantining it would only obscure the
# quarantine directory's real purpose.
#
# Note that .md and .txt ARE ingested, so notes written beside a corpus drop will
# be indexed as documents unless they live under a skipped directory -- see
# _ALWAYS_IGNORED_DIRNAMES / INGESTIGNORE_FILENAME below (PRODUCTION_TODO.md T11a).
SUPPORTED_SUFFIXES = {
    ".pdf",
    # Images are ingestable because a scanned judgment often arrives as one file
    # per page; the pipeline treats an ordered set as a single document.
    ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp",
    ".zip",
    # Plain text and Markdown: bare acts and India Code extracts arrive this way.
    ".txt", ".md",
}

FAILED_DIRNAME = ".failed"
# Skipped while scanning: our own quarantine, and the partial files a copy or an
# rsync into the inbox is still writing.
_IGNORED_PREFIXES = (".", "~")
_PARTIAL_SUFFIXES = {".part", ".partial", ".tmp", ".crdownload", ".filepart"}

# Always skipped, anywhere in the tree, so operator files -- a README, a
# batch manifest, a scratch note -- have somewhere to live without being read
# as documents (SUPPORTED_SUFFIXES above includes .txt/.md for exactly the
# court material that legitimately arrives that way). PRODUCTION_TODO.md T11a.
_ALWAYS_IGNORED_DIRNAMES = frozenset({"notes"})
# One directory name per line, "#" comments and blank lines ignored. Read
# fresh on every pass -- no restart needed to add an exclusion.
INGESTIGNORE_FILENAME = ".ingestignore"

# Written by the API next to an upload's spooled file(s), one per job
# directory -- never tied to a page's own filename, so it is found the same
# way whether the job has one page or several. See the module docstring.
MANIFEST_FILENAME = "job.manifest.json"

_stop_requested = False


def _request_stop(signum, _frame) -> None:
    """Finish the document in flight, then exit cleanly.

    A SIGKILL mid-document is safe (the pipeline's commit point makes it a
    re-ingest), but a clean stop also flushes FAISS, which saves the next start
    a rebuild.
    """
    global _stop_requested
    _stop_requested = True
    logger.info("Signal %s received; finishing the current document then stopping", signum)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--once", action="store_true", help="one pass, then exit")
    parser.add_argument("--inbox", type=Path, default=None, help="override INBOX_ROOT")
    parser.add_argument(
        "--interval", type=float, default=30.0, help="seconds between passes (default: 30)"
    )
    parser.add_argument(
        "--collection", default=PUBLIC_COLLECTION, help="target collection"
    )
    parser.add_argument(
        "--batch", type=int, default=500,
        help="max documents per pass, 0 = unlimited (default: 500; see PRODUCTION_TODO.md T11a "
        "-- bounds inbox-scan cost, not just ingest work, so it should stay finite in production)",
    )
    args = parser.parse_args(argv)

    configure_logging("ingest")
    signal.signal(signal.SIGTERM, _request_stop)
    signal.signal(signal.SIGINT, _request_stop)

    services = build_services()
    startup(services)

    inbox = args.inbox or services.config.inbox_root
    inbox.mkdir(parents=True, exist_ok=True)
    logger.info(
        "Ingest worker watching %s -> collection '%s' (%s)",
        inbox, args.collection, "single pass" if args.once else f"every {args.interval:.0f}s",
    )

    try:
        _report_incomplete(services, args.collection)
        while True:
            processed = _drain(services, inbox, args.collection, args.batch)
            if args.once or _stop_requested:
                break
            # Only sleep when the inbox came up empty. After a productive pass
            # there may be more waiting, and a fixed sleep between every
            # document would make a large import take days longer than it needs.
            if processed == 0:
                _sleep_interruptibly(args.interval)
    finally:
        shutdown(services)

    logger.info("Ingest worker stopped")
    return 0


def _sleep_interruptibly(seconds: float) -> None:
    """Sleep in short slices so SIGTERM is honoured promptly, not `interval` late."""
    deadline = time.monotonic() + seconds
    while not _stop_requested and time.monotonic() < deadline:
        time.sleep(min(1.0, deadline - time.monotonic()))


def _report_incomplete(services, collection: str) -> None:
    """Log documents left mid-pipeline by a previous run.

    Not auto-retried from here: their source file has usually already been
    consumed from the inbox, so the fix is a targeted re-ingest or a rebuild, and
    silently looping over them would hide a systematic parser failure.
    """
    try:
        stalled = services.metadata.incomplete_documents(collection)
    except Exception:  # noqa: BLE001
        logger.exception("Could not read the incomplete-document worklist")
        return
    if stalled:
        logger.warning(
            "%d document(s) are not 'complete' (e.g. %s). Inspect with "
            "rag/scripts/verify_rag.py; re-ingest or rebuild as needed.",
            len(stalled),
            ", ".join(f"{d.document_id}[{d.status}]" for d in stalled[:5]),
        )


def _drain(services, inbox: Path, collection: str, batch: int) -> int:
    """Ingest every eligible file in the inbox. Returns how many were handled."""
    from rag.app.ingest.pipeline import IngestionPipeline

    pipeline = IngestionPipeline(services)
    processed = 0
    # Reuses FAISS_FLUSH_EVERY (a vector count elsewhere -- see
    # VectorIndex._effective_flush_threshold) as a document count here: one
    # operator-facing knob rather than two, and the exact number matters far
    # less than "bounded" does. This is independent of _pending_files' own
    # scan bound below -- a large or unbounded (--batch 0) pass still needs
    # to flush as it goes, not just once at the end. PRODUCTION_TODO.md T11a.
    flush_every = max(1, services.config.faiss_flush_every)

    for path in _pending_files(inbox, batch):
        if _stop_requested:
            break
        if batch and processed >= batch:
            logger.info("Batch limit of %d reached; remaining files wait for the next pass", batch)
            break
        _ingest_one(services, pipeline, path, inbox, collection)
        processed += 1
        if processed % flush_every == 0:
            services.indexes.flush_all()

    if processed:
        # Persist the vectors added this pass rather than leaving them to the
        # flush interval: a worker killed between passes should not cost the
        # index a rebuild.
        services.indexes.flush_all()
        logger.info("Pass complete: %d document(s) handled", processed)
    return processed


def _ingestignore_dirnames(inbox: Path) -> frozenset[str]:
    """Directory names to skip anywhere in the tree this pass.

    Read fresh every call (cheap: one small file, once per pass) rather than
    cached, so adding a line takes effect on the next pass, not a restart.
    """
    names = set(_ALWAYS_IGNORED_DIRNAMES)
    try:
        text = (inbox / INGESTIGNORE_FILENAME).read_text(encoding="utf-8")
    except OSError:
        return frozenset(names)
    for line in text.splitlines():
        name = line.split("#", 1)[0].strip()
        if name:
            names.add(name)
    return frozenset(names)


def _pending_files(inbox: Path, limit: int = 0) -> list[Path]:
    """Up to `limit` ingestable files (0 = unlimited), oldest first per directory.

    Walks lazily via `os.scandir` and stops as soon as `limit` candidates are
    found, so the cost of finding the next batch does not grow with the size
    of the backlog -- see PRODUCTION_TODO.md T11a (the previous implementation
    built the full recursive listing, every pass, before sorting any of it).
    Ordering is oldest-first *within* each directory rather than a total order
    across the whole tree: the point was fairness among files that arrived
    together, not a global timestamp order, and a global order is exactly what
    would force a full scan to establish.
    """
    ignored_dirnames = _ingestignore_dirnames(inbox)
    candidates: list[Path] = []

    def _walk(directory: Path) -> bool:
        """True once `limit` is reached and the scan should stop descending."""
        try:
            entries = list(os.scandir(directory))
        except OSError:
            return False

        files: list[Path] = []
        subdirs: list[Path] = []
        for entry in entries:
            if entry.name.startswith(_IGNORED_PREFIXES):
                continue
            try:
                is_dir = entry.is_dir(follow_symlinks=False)
            except OSError:
                continue
            if is_dir:
                if entry.name == FAILED_DIRNAME or entry.name in ignored_dirnames:
                    continue
                subdirs.append(Path(entry.path))
            else:
                files.append(Path(entry.path))

        for path in sorted(files, key=_safe_mtime):
            if not _is_pending_file(path):
                continue
            candidates.append(path)
            if limit and len(candidates) >= limit:
                return True

        for sub in sorted(subdirs, key=lambda p: p.name):
            if _walk(sub):
                return True
        return False

    _walk(inbox)
    return candidates


def _safe_mtime(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except OSError:
        return 0.0


def _is_pending_file(path: Path) -> bool:
    if path.suffix.lower() in _PARTIAL_SUFFIXES:
        return False
    if path.suffix.lower() not in SUPPORTED_SUFFIXES:
        return False
    if _still_being_written(path):
        return False
    # A manifest job with more than one page (ordered images of one physical
    # document, or `files` on /ingest) writes every page into the same job
    # directory alongside one job.manifest.json. Only its first page is a
    # pending file in its own right -- the rest are consumed alongside it in
    # _ingest_one so the pipeline sees one document, not several.
    manifest = _load_manifest(_manifest_for(path))
    if manifest:
        pages = manifest.get("paths") or [path.name]
        if path.name != pages[0]:
            return False
    return True


def _manifest_for(path: Path) -> Path:
    return path.parent / MANIFEST_FILENAME


def _load_manifest(manifest_path: Path) -> dict | None:
    if not manifest_path.exists():
        return None
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Unreadable manifest %s: %s", manifest_path, exc)
        return None


def _job_paths(path: Path, manifest: dict | None) -> list[Path]:
    """Every file belonging to this job -- one page, or several."""
    if not manifest:
        return [path]
    pages = manifest.get("paths") or [path.name]
    return [path.parent / name for name in pages]


def _still_being_written(path: Path, settle_seconds: float = 5.0) -> bool:
    """True while a file was modified very recently.

    A large PDF copied in over the network is a valid, parseable, *truncated*
    file for most of its transfer. Waiting for it to stop changing is the cheap
    way to avoid ingesting half a judgment and content-addressing it under a hash
    that will never be seen again.
    """
    try:
        return (time.time() - path.stat().st_mtime) < settle_seconds
    except OSError:
        return True


def _ingest_one(services, pipeline, path: Path, inbox: Path, collection: str) -> None:
    relative = path.relative_to(inbox)
    manifest = _load_manifest(_manifest_for(path))

    if manifest:
        # An API-submitted job (see the module docstring): every field the
        # pipeline needs was decided by the route at upload time, not derived
        # from where the file happens to sit in the inbox tree.
        job_id = manifest["job_id"]
        document_id = manifest["document_id"]
        target_collection = manifest.get("collection") or collection
        court_hint = manifest.get("court_hint")
        extra_metadata = {**(manifest.get("extra_metadata") or {}), "source": "api"}
        dedupe_scope = manifest.get("dedupe_scope") or ""
        persist_source = manifest.get("persist_source", True)
        pages = manifest.get("paths") or [path.name]
        ingest_target = [path.parent / name for name in pages] if len(pages) > 1 else path
        services.metadata.update_ingest_job(job_id, status="processing")
    else:
        job_id = None
        court_hint = _court_hint(relative)
        document_id = f"inbox:{relative.as_posix()}"
        target_collection = collection
        extra_metadata = {"source": "inbox", "inbox_path": relative.as_posix()}
        dedupe_scope = ""
        persist_source = True
        ingest_target = path

    logger.info("Ingesting %s%s", relative, f" (court hint: {court_hint})" if court_hint else "")
    started = time.perf_counter()
    try:
        result = pipeline.ingest(
            ingest_target,
            document_id=document_id,
            collection=target_collection,
            court_hint=court_hint,
            extra_metadata=extra_metadata,
            dedupe_scope=dedupe_scope,
            persist_source=persist_source,
        )
    except Exception as exc:  # noqa: BLE001 -- one bad file must not stop the queue
        logger.exception("Ingest failed for %s: %s", relative, exc)
        if job_id:
            services.metadata.update_ingest_job(job_id, status="failed", error=str(exc))
        _quarantine_job(path, manifest, inbox)
        return

    elapsed = time.perf_counter() - started
    if result.skipped:
        # Already in the corpus. The archived copy is authoritative, so the
        # inbox copy is redundant either way.
        logger.info(
            "Skipped %s (%s; already stored as %s)",
            relative, result.reason, result.existing_document_id,
        )
        if job_id:
            services.metadata.update_ingest_job(
                job_id,
                status="duplicate",
                document_id=result.existing_document_id,
                result=result.to_dict(),
            )
    else:
        logger.info(
            "Ingested %s in %.1fs: %d chunk(s), %d page(s)",
            relative, elapsed, result.chunk_count, result.page_count,
        )
        if job_id:
            services.metadata.update_ingest_job(
                job_id, status="complete", document_id=document_id, result=result.to_dict(),
            )
    _consume_job(path, manifest, inbox)


def _court_hint(relative: Path) -> str | None:
    """Read a court from the inbox subdirectory, when it names a real one.

    Tries the two-segment form before the one-segment form, because high courts
    are addressed as ``hc/<bench>``: for ``hc/delhi/rao.pdf`` the useful hint is
    "hc/delhi", while "hc" on its own matches no court at all and would silently
    file a Delhi High Court judgment under `misc`.
    """
    parts = relative.parts
    # parts[-1] is the filename, so a candidate prefix has to stop short of it.
    for depth in (2, 1):
        if len(parts) <= depth:
            continue
        court = resolve_court("/".join(parts[:depth]))
        if court.code != UNKNOWN_COURT:
            return court.code
    return None


def _consume_job(path: Path, manifest: dict | None, inbox: Path) -> None:
    """Remove every file belonging to this job after the archive has it --
    every page for a manifest job, one file otherwise -- pruning empty
    directories and the manifest itself."""
    for member in _job_paths(path, manifest):
        try:
            member.unlink()
        except OSError as exc:
            logger.warning("Could not remove %s from the inbox: %s", member, exc)
    if manifest:
        _manifest_for(path).unlink(missing_ok=True)
    _prune_empty(path.parent, inbox)


def _quarantine_job(path: Path, manifest: dict | None, inbox: Path) -> None:
    """Move every file belonging to a failed job aside, preserving position.

    Structure is preserved so the court hint encoded in the path survives: fix
    the cause, move the subtree back, and it re-ingests exactly as it would have.
    """
    for member in _job_paths(path, manifest):
        target = inbox / FAILED_DIRNAME / member.relative_to(inbox)
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(member), str(target))
            logger.warning("Quarantined %s -> %s", member.name, target)
        except OSError as exc:
            logger.error("Could not quarantine %s: %s", member, exc)
    if manifest:
        _manifest_for(path).unlink(missing_ok=True)
    _prune_empty(path.parent, inbox)


def _prune_empty(directory: Path, stop_at: Path) -> None:
    """Remove now-empty inbox subdirectories, never touching the inbox itself."""
    current = directory
    while current != stop_at and stop_at in current.parents:
        try:
            current.rmdir()
        except OSError:
            return  # not empty, or not ours -- either way, stop climbing
        current = current.parent


if __name__ == "__main__":
    raise SystemExit(main())
