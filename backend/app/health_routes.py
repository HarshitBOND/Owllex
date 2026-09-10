"""Deep health checks: /health/vector, /health/sqlite, /health/lmdb, /health/storage.

Every endpoint here touches the dependency it reports on. A check that returns a
constant "ok" is worse than no check at all -- it converts an outage into a
silent one -- so each of these opens the store, reads something out of it, and
reports what it found.

**Liveness vs readiness.** ``/health`` (in app/main.py) stays a *liveness* probe:
it answers 200 whenever the process can serve, because that is what the
Cloudflare container's ``pingEndpoint`` and lib/backendClient.ts both read, and
returning 503 there for a degraded-but-serving RAG stack would restart-loop a
container that is answering the parser and scraper routes perfectly well. The
endpoints below are *readiness* probes: they return 503 when their dependency is
actually broken, and they are what the deployment's monitoring should page on.

**No lazy construction.** These handlers never call ``get_services()`` unless the
stack is already started. Building it loads the embedding model -- ~16GB and
minutes of wall clock for Qwen3-8B -- and a health probe that can trigger that is
a denial-of-service endpoint wearing a monitoring costume. When the stack is down
the checks fall back to inspecting the on-disk state directly, which is both
cheap and, for "is my data still there", the more honest answer anyway.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import sqlite3
import time
from pathlib import Path
from typing import Any, Callable

from fastapi import APIRouter
from fastapi.responses import JSONResponse

logger = logging.getLogger("ravenslaw.health")

health_router = APIRouter(prefix="/health", tags=["System"])

# Reported when a store is reachable but the stack that would serve queries from
# it has not been started (RAG extras not installed, or startup failed).
STATUS_OK = "ok"
STATUS_DEGRADED = "degraded"
STATUS_DOWN = "down"

# A check that has to be *this* far past its budget is reported rather than
# waited on -- a health endpoint that blocks is indistinguishable from a hang.
_SQLITE_TIMEOUT_MS = 5_000


# ─── Response helper ─────────────────────────────────────────────────────────


def _respond(payload: dict[str, Any]) -> JSONResponse:
    """503 for a down dependency, 200 otherwise.

    ``degraded`` deliberately answers 200: the store itself is intact and the
    data is safe, something above it just is not running. Paging on that at 3am
    trains people to ignore the pager.
    """
    code = 503 if payload.get("status") == STATUS_DOWN else 200
    return JSONResponse(status_code=code, content=payload)


def _guard(name: str, check: Callable[[], dict[str, Any]]) -> dict[str, Any]:
    """Run one check, turning any exception into a reported failure.

    A health endpoint that 500s tells an operator only that something is wrong.
    Catching here means the response still names the store, the path, and the
    error text, which is the difference between "the backend is down" and "the
    volume is not mounted".
    """
    started = time.perf_counter()
    try:
        result = check()
    except Exception as exc:  # noqa: BLE001 -- reporting the failure IS the job
        logger.warning("Health check %s failed: %s", name, exc)
        result = {"status": STATUS_DOWN, "error": f"{type(exc).__name__}: {exc}"}
    result["check"] = name
    result["duration_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return result


def _config():
    """Resolved RagConfig. Cheap -- reads the environment, loads no model."""
    from rag.core.config import get_config

    return get_config()


def _started_services():
    """The running container, or None. Never builds one."""
    try:
        from rag.core.services import get_services, is_started
    except ImportError:
        return None
    return get_services() if is_started() else None


# ─── SQLite ──────────────────────────────────────────────────────────────────


@health_router.get("/sqlite", summary="Metadata database connectivity and integrity")
async def health_sqlite() -> JSONResponse:
    return _respond(_guard("sqlite", _check_sqlite))


def _check_sqlite() -> dict[str, Any]:
    """Open the database, run a real query, and report what it holds."""
    config = _config()
    path = config.sqlite_path

    if not path.exists():
        # Two very different situations wearing the same symptom. On a fresh box
        # the schema has simply not been created yet, which is expected and must
        # not page anyone. But if the stack is *running*, it opened this file at
        # startup and something has since deleted it -- that is a genuine outage
        # and has to answer 503.
        running = _started_services() is not None
        return {
            "status": STATUS_DOWN if running else STATUS_DEGRADED,
            "path": str(path),
            "detail": (
                "database file has disappeared while the stack is running"
                if running
                else "database file does not exist yet (no ingest has run)"
            ),
        }

    connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=_SQLITE_TIMEOUT_MS / 1000)
    try:
        connection.row_factory = sqlite3.Row
        # quick_check is the cheap integrity pass -- full integrity_check walks
        # every page and would take minutes on a large corpus, which is far too
        # slow for something a monitor hits every 30 seconds.
        integrity = connection.execute("PRAGMA quick_check(1)").fetchone()[0]
        journal_mode = connection.execute("PRAGMA journal_mode").fetchone()[0]
        documents = connection.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
        chunks = connection.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    finally:
        connection.close()

    healthy = integrity == "ok"
    return {
        "status": STATUS_OK if healthy else STATUS_DOWN,
        "path": str(path),
        "integrity": integrity,
        "journal_mode": journal_mode,
        "size_bytes": path.stat().st_size,
        "documents": documents,
        "chunks": chunks,
    }


# ─── LMDB ────────────────────────────────────────────────────────────────────


@health_router.get("/lmdb", summary="Content-hash dedup index readability")
async def health_lmdb() -> JSONResponse:
    return _respond(_guard("lmdb", _check_lmdb))


def _check_lmdb() -> dict[str, Any]:
    """Count the entries in the hash index and report how full its map is.

    Reuses the running HashIndex when the stack is up, and only opens a private
    read-only handle when it is not. That is not an optimisation: LMDB refuses to
    open the same environment twice **within one process**, so a second
    ``lmdb.open`` here would raise and report a perfectly healthy index as down --
    a false alarm generated entirely by the monitoring.
    """
    config = _config()
    path = config.lmdb_path

    services = _started_services()
    if services is not None:
        # Read-only calls on the live handle; safe against a concurrent ingest.
        env = services.hashes.env
        return _lmdb_payload(path, env.stat(), env.info(), live=True)

    import lmdb

    if not (path / "data.mdb").exists():
        return {
            "status": STATUS_DEGRADED,
            "path": str(path),
            "detail": "no data.mdb yet (nothing has been ingested)",
        }

    # lock=False so a health probe never blocks on, or blocks, a writer.
    env = lmdb.open(str(path), readonly=True, lock=False, max_dbs=1)
    try:
        return _lmdb_payload(path, env.stat(), env.info(), live=False)
    finally:
        env.close()


def _lmdb_payload(path, stat: dict, info: dict, live: bool) -> dict[str, Any]:
    """Shape one payload from LMDB's two separate metric sources.

    The page size lives in ``stat()`` and the page count in ``info()``, so the
    disk figure needs both.
    """
    entries = stat["entries"]
    used = info["last_pgno"] * stat["psize"]
    map_size = info["map_size"]
    # LMDB cannot grow past map_size without a restart, so filling it is a hard
    # stop for ingestion, not a slow degradation. Warn well before that.
    utilisation = used / map_size if map_size else 0.0

    return {
        "status": STATUS_DEGRADED if utilisation > 0.90 else STATUS_OK,
        "path": str(path),
        "live_handle": live,
        "entries": entries,
        "map_size_bytes": map_size,
        "used_bytes": used,
        "map_utilisation_pct": round(utilisation * 100, 1),
        "detail": (
            "map is over 90% full -- raise LMDB_MAP_SIZE_MB and restart before it fills"
            if utilisation > 0.90
            else None
        ),
    }


# ─── FAISS ───────────────────────────────────────────────────────────────────


@health_router.get("/vector", summary="FAISS index state and drift against SQLite")
async def health_vector() -> JSONResponse:
    return _respond(_guard("vector", _check_vector))


def _check_vector() -> dict[str, Any]:
    """Report every collection's vector count, in memory if loaded, on disk if not.

    Also reports *drift*: FAISS and SQLite are two stores that must agree on how
    much is indexed, and a mismatch means searches are silently missing results.
    Nothing else in the running system notices that on its own.
    """
    from rag.core.vector_index import COLLECTIONS

    config = _config()
    services = _started_services()
    collections: dict[str, Any] = {}
    worst = STATUS_OK

    for collection in COLLECTIONS:
        entry = _collection_health(config, services, collection)
        collections[collection] = entry
        if entry["status"] == STATUS_DOWN:
            worst = STATUS_DOWN
        elif entry["status"] == STATUS_DEGRADED and worst == STATUS_OK:
            worst = STATUS_DEGRADED

    return {
        "status": worst,
        "loaded": services is not None,
        "faiss_root": str(config.faiss_root),
        "embed_model": config.embed_model,
        "embed_dim": config.embed_dim,
        "index_factory": config.faiss_index_factory,
        "collections": collections,
    }


def _collection_health(config, services, collection: str) -> dict[str, Any]:
    index_path = config.faiss_index_path(collection)
    meta_path = index_path.with_suffix(".meta.json")

    entry: dict[str, Any] = {"path": str(index_path), "exists": index_path.exists()}

    if index_path.exists():
        entry["size_bytes"] = index_path.stat().st_size
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text())
            entry["signature"] = meta.get("signature")
            entry["dimension"] = meta.get("dimension")
            entry["ntotal_on_disk"] = meta.get("ntotal")
        except (OSError, json.JSONDecodeError) as exc:
            entry["meta_error"] = str(exc)

    if services is None:
        # Nothing is serving searches; the files are all we can honestly report.
        entry["status"] = STATUS_DEGRADED if index_path.exists() else STATUS_OK
        entry["detail"] = "RAG stack not started; reporting on-disk state only"
        return entry

    index = services.indexes.get(collection)
    entry["ntotal"] = index.ntotal
    entry["dimension"] = index.dimension

    # The signature check is the one that matters most: a mismatch does not
    # error at query time, it just returns confidently wrong neighbours.
    stored_signature = entry.get("signature")
    if stored_signature and stored_signature != services.signature:
        entry["status"] = STATUS_DOWN
        entry["detail"] = (
            f"index was built with embeddings '{stored_signature}' but this process is "
            f"configured for '{services.signature}'"
        )
        return entry

    expected = services.metadata.stats(collection)["chunk_count"]
    entry["sqlite_chunks"] = expected
    if expected != index.ntotal:
        entry["status"] = STATUS_DEGRADED
        entry["detail"] = (
            f"drift: SQLite has {expected} chunks, FAISS has {index.ntotal} vectors. "
            f"Run rag/scripts/rebuild_index.py --collection {collection}."
        )
    else:
        entry["status"] = STATUS_OK
    return entry


# ─── Storage ─────────────────────────────────────────────────────────────────


@health_router.get("/storage", summary="Data volume mount, writability and free space")
async def health_storage() -> JSONResponse:
    return _respond(_guard("storage", _check_storage))


def _check_storage() -> dict[str, Any]:
    """Verify the data volume is mounted, writable, and not close to full.

    The mount check is the important one. If the Hetzner volume fails to mount,
    ``/data`` is still a perfectly good *directory on the boot disk*: ingestion
    keeps working, the API reports healthy, and the corpus quietly fills a 40GB
    SSD and dies with the instance. Comparing the device id of DATA_ROOT against
    the one APP_ROOT sits on is what catches that, and it is the single check in
    this file most likely to save the deployment.
    """
    config = _config()
    checks: dict[str, Any] = {}
    worst = STATUS_OK

    restricted = {p.resolve() for p in config.restricted_dirs}

    for name, path in (
        ("data_root", config.data_root),
        ("legal_corpus", config.legal_corpus_root),
        ("users", config.users_root),
        ("faiss", config.faiss_root),
        ("sqlite", config.sqlite_path.parent),
        ("lmdb", config.lmdb_path),
        ("backups", config.backup_root),
        ("private", config.private_root),
        ("inbox", config.inbox_root),
    ):
        entry = _directory_health(path, expect_private=path.resolve() in restricted)
        checks[name] = entry
        if entry["status"] == STATUS_DOWN:
            worst = STATUS_DOWN
        elif entry["status"] == STATUS_DEGRADED and worst == STATUS_OK:
            worst = STATUS_DEGRADED

    usage = shutil.disk_usage(config.data_root) if config.data_root.exists() else None
    separate = _on_separate_device(config.data_root, config.app_root)
    inodes = _inode_health(config.data_root)

    # Inode exhaustion is the failure that looks like nothing: `df -h` shows
    # plenty of free space and every write fails with ENOSPC anyway. It is a real
    # risk here rather than a theoretical one -- the corpus is millions of small
    # content-addressed PDFs, and each hard-linked nightly backup snapshot adds
    # another inode per file.
    if inodes is not None:
        if inodes["free_pct"] < 5:
            worst = STATUS_DOWN
        elif inodes["free_pct"] < 15 and worst == STATUS_OK:
            worst = STATUS_DEGRADED

    if usage is not None:
        free_pct = usage.free / usage.total * 100 if usage.total else 0
        # 5% free on a corpus volume is an emergency: ingestion, SQLite's WAL and
        # the nightly backup all need room, and SQLite corrupts far more
        # interestingly than it fails when it runs out.
        if free_pct < 5:
            worst = STATUS_DOWN
        elif free_pct < 15 and worst == STATUS_OK:
            worst = STATUS_DEGRADED

    payload: dict[str, Any] = {
        "status": worst,
        "data_root": str(config.data_root),
        "app_root": str(config.app_root),
        "separate_device": separate,
        "mounted": separate,
        "paths": checks,
    }
    if inodes is not None:
        payload["inodes"] = inodes
    if separate is False:
        # Not fatal on a dev box, so it does not force DOWN on its own -- but it
        # must be loud, because in production it means the volume never mounted.
        payload["warning"] = (
            f"{config.data_root} is on the same device as {config.app_root}. In production "
            f"this means the data volume is NOT mounted -- check `findmnt {config.data_root}` "
            f"before ingesting anything."
        )
        if worst == STATUS_OK:
            payload["status"] = STATUS_DEGRADED

    if usage is not None:
        payload["disk"] = {
            "total_bytes": usage.total,
            "used_bytes": usage.used,
            "free_bytes": usage.free,
            "free_pct": round(usage.free / usage.total * 100, 1) if usage.total else 0.0,
        }

    return payload


def _directory_health(path: Path, *, expect_private: bool = False) -> dict[str, Any]:
    """Exists, can actually be written to, and -- where it holds user files --
    is not readable by anyone else.

    Writability is tested by writing, not by ``os.access``: a read-only remount,
    a full filesystem and a permissions mismatch between the systemd user and the
    volume all pass an access() check and fail the first real write.

    The permission check is reported as DEGRADED rather than DOWN because a
    loosened mode does not stop the service -- it just means the documents under
    it are readable by every local account, which is a thing an operator has to
    be told about rather than a reason to fail the deployment's health probe.
    """
    if not path.exists():
        return {"status": STATUS_DOWN, "path": str(path), "exists": False}

    probe = path / f".health-probe-{os.getpid()}"
    try:
        probe.write_bytes(b"ok")
        probe.unlink()
    except OSError as exc:
        return {
            "status": STATUS_DOWN,
            "path": str(path),
            "exists": True,
            "writable": False,
            "error": str(exc),
        }

    entry: dict[str, Any] = {
        "status": STATUS_OK,
        "path": str(path),
        "exists": True,
        "writable": True,
    }

    if expect_private:
        try:
            mode = path.stat().st_mode & 0o777
        except OSError:
            return entry
        entry["mode"] = oct(mode)
        if mode & 0o077:
            entry["status"] = STATUS_DEGRADED
            entry["error"] = (
                f"{path} is mode {oct(mode)}; user documents must be 0700. "
                f"Fix with: chmod 700 {path}"
            )
    return entry


def _inode_health(path: Path) -> dict[str, Any] | None:
    """Inode usage on the filesystem backing ``path``, where the OS reports it."""
    try:
        stat = os.statvfs(path)
    except (OSError, AttributeError):
        return None
    total = stat.f_files
    if not total:
        # Reported as 0 on filesystems that allocate inodes dynamically (btrfs,
        # xfs with no fixed table). Nothing to warn about there.
        return None
    free = stat.f_favail
    return {
        "total": total,
        "free": free,
        "used": total - free,
        "free_pct": round(free / total * 100, 1),
    }


def _on_separate_device(data_root: Path, app_root: Path) -> bool | None:
    """True when DATA_ROOT is a different block device than the application code.

    None when it cannot be determined (app_root absent, as on a dev checkout).
    """
    try:
        if not data_root.exists() or not app_root.exists():
            return None
        return os.stat(data_root).st_dev != os.stat(app_root).st_dev
    except OSError:
        return None


# ─── Aggregate, used by /health in app/main.py ────────────────────────────────


# The summary is cached because /health is polled hard -- the Cloudflare
# container pings it on a timer and an uptime monitor will too. Running the four
# checks uncached would mean a SQLite integrity pass and seven directory write
# probes several times a minute, forever, for a number that cannot meaningfully
# change that fast. The granular endpoints are never cached: someone opening
# /health/storage is asking about *now*.
_SUMMARY_TTL_SECONDS = 15.0
_summary_cache: tuple[float, dict[str, str]] | None = None


def dependency_summary() -> dict[str, str]:
    """One-word status per store, cached briefly, for the liveness endpoint.

    Deliberately returns only statuses: the detailed payloads belong on the
    endpoints an operator actually opens.
    """
    global _summary_cache

    now = time.monotonic()
    if _summary_cache is not None and now - _summary_cache[0] < _SUMMARY_TTL_SECONDS:
        return _summary_cache[1]

    summary: dict[str, str] = {}
    for name, check in (
        ("sqlite", _check_sqlite),
        ("lmdb", _check_lmdb),
        ("vector", _check_vector),
        ("storage", _check_storage),
    ):
        try:
            summary[name] = check().get("status", STATUS_DOWN)
        except Exception:  # noqa: BLE001
            summary[name] = STATUS_DOWN

    _summary_cache = (now, summary)
    return summary
