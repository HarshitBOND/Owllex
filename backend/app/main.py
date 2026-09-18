"""
Ravenslaw - FastAPI Application Entry Point
==========================================
Delhi High Court Cause List Parser API.

Usage:
    uvicorn app.main:app --host 0.0.0.0 --port 8000
    # or
    python run.py
"""

import logging
import os
import threading
import time
from collections import OrderedDict, deque
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from . import __version__
from .config import settings
from .document_routes import public_documents_router, user_documents_router
from .health_routes import dependency_summary, health_router
from .logging_setup import configure_logging
from .models import HealthResponse
from .rag_routes import rag_router
from .routes import router
from .scraper_routes import scraper_router
from .security import require_internal_token
from .userdetails_routes import userdetails_router

# ─── Logging ─────────────────────────────────────────────────────────────────

# stdout (journald) plus a rotating /var/log/owllex/rag.log -- see
# app/logging_setup.py for why both.
_LOG_PATH = configure_logging("rag", debug=settings.DEBUG)
logger = logging.getLogger("ravenslaw")


class _RateLimiter:
    """In-memory, per-process, per-IP request-rate tracking.

    PRODUCTION_TODO.md T19a. **Not the authoritative limiter** -- nginx's
    `limit_req zone=owllex_api` (deploy/nginx/owllex.conf) is: it sits in
    front of this process and is the only layer that sees the raw TCP
    connection rather than whatever `request.client.host` reports one hop
    downstream, and it is not reset by a restart of this process the way this
    in-memory tracker is. This one exists as defence in depth for anything
    that reaches the app without going through nginx (a healthcheck run
    directly against 127.0.0.1:8000, a misconfigured proxy in front) -- and
    because "per-process" only matters at all while `owllex-rag` runs with
    `--workers 1` (PRODUCTION_TODO.md T2's design); nginx's view stays
    authoritative across however many workers there are either way.

    Unbounded before this task: every distinct IP that ever reached the
    process kept its own `deque` forever, in a `Restart=always` unit expected
    to run for months behind a public endpoint -- a few million probing
    source addresses is a few hundred MB of dead dict entries. Bounded two
    ways now, per this task's Change item 1:

    * entries are swept opportunistically, every `_sweep_every` requests
      rather than on every single one, dropping any IP whose *newest* logged
      request already fell outside the window (if the newest one is stale,
      every older one in that bucket is too);
    * the tracked-IP count is capped independently of the sweep, with LRU
      eviction (`OrderedDict` + `move_to_end`) -- a burst of unique source
      addresses between sweeps cannot grow the dict past `max_tracked_ips`
      regardless of how the sweep timing lands.
    """

    def __init__(
        self,
        window_seconds: float,
        max_requests: int,
        max_tracked_ips: int,
        sweep_every: int = 1000,
    ) -> None:
        self._window_seconds = window_seconds
        self._max_requests = max_requests
        self._max_tracked_ips = max_tracked_ips
        self._sweep_every = max(1, sweep_every)
        self._buckets: "OrderedDict[str, deque]" = OrderedDict()
        self._requests_since_sweep = 0

    def allow(self, client_ip: str, *, now: float | None = None) -> bool:
        """True if this request is within the limit; also records it."""
        now = time.time() if now is None else now
        window_start = now - self._window_seconds

        bucket = self._buckets.get(client_ip)
        if bucket is None:
            bucket = deque()
            self._buckets[client_ip] = bucket
        else:
            # Mark most-recently-used so `_enforce_cap`'s eviction takes the
            # IPs that have gone quiet the longest, not an arbitrary one.
            self._buckets.move_to_end(client_ip)

        while bucket and bucket[0] < window_start:
            bucket.popleft()

        allowed = len(bucket) < self._max_requests
        if allowed:
            bucket.append(now)

        self._requests_since_sweep += 1
        if self._requests_since_sweep >= self._sweep_every:
            self._sweep(window_start)

        self._enforce_cap()
        return allowed

    def _sweep(self, window_start: float) -> None:
        self._requests_since_sweep = 0
        stale = [ip for ip, bucket in self._buckets.items() if not bucket or bucket[-1] < window_start]
        for ip in stale:
            del self._buckets[ip]

    def _enforce_cap(self) -> None:
        while len(self._buckets) > self._max_tracked_ips:
            self._buckets.popitem(last=False)  # least-recently-used

    def __len__(self) -> int:
        return len(self._buckets)


_rate_limiter = _RateLimiter(
    window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
    max_requests=settings.RATE_LIMIT_MAX_REQUESTS,
    max_tracked_ips=settings.RATE_LIMIT_MAX_TRACKED_IPS,
)

# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Ravenslaw - DHC Cause List Parser",
    description="Parse Delhi High Court cause list PDFs into structured JSON data.",
    version=__version__,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    # In-memory per-IP rate limiting for baseline abuse protection. The whole
    # /health tree is exempt: an uptime monitor polling four endpoints every 30s
    # must never be the thing that trips the limiter and reports an outage it
    # caused itself.
    if not request.url.path.startswith("/health"):
        client_ip = request.client.host if request.client else "unknown"
        if not _rate_limiter.allow(client_ip):
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded"},
            )

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-site"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.TRUSTED_HOSTS,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Routes
app.include_router(
    router,
    prefix="/api/v1",
    tags=["Parser"],
    dependencies=[Depends(require_internal_token)],
)
app.include_router(
    scraper_router,
    prefix="/api/v1/scraper",
    tags=["Scraper"],
    dependencies=[Depends(require_internal_token)],
)
app.include_router(
    rag_router,
    prefix="/api/v1/rag",
    tags=["RAG"],
    dependencies=[Depends(require_internal_token)],
)
app.include_router(userdetails_router)
# Document delivery. Both routers authenticate per request rather than inheriting
# the internal token the RAG router uses: /api/user-documents derives ownership
# from a verified Clerk subject, and /api/documents accepts either that or the
# internal token. Mounting them under the internal-token dependency instead would
# make every private document readable by anything holding that one shared
# secret, which is precisely the property this split exists to remove.
app.include_router(user_documents_router)
app.include_router(public_documents_router)
# Deep per-store checks. Unauthenticated on purpose: they are what an uptime
# monitor and `systemctl` health tooling poll, they expose counts and paths
# rather than corpus content, and nginx restricts /health/* to the local network
# in front of this anyway (see deploy/nginx/owllex.conf).
app.include_router(health_router)


# ─── Root ────────────────────────────────────────────────────────────────────

@app.get("/", tags=["System"], include_in_schema=False)
async def root():
    """Service banner.

    Every route lives under /api/v1, so the bare origin used to 404 -- which is
    what a browser, an uptime probe, or anyone checking whether the backend is
    up hits first, and a 404 there reads as "wrong URL" rather than "running".
    """
    return {
        "service": "ravenslaw-api",
        "version": __version__,
        "status": "ok",
        "docs": "/docs" if settings.DEBUG else None,
        "health": "/health",
    }


# ─── Health check ────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """Liveness. 200 whenever this process can serve a request.

    Deliberately not a readiness probe. The Cloudflare container uses this as its
    ``pingEndpoint`` and lib/backendClient.ts reads only ``response.ok``, so
    answering 503 for a degraded RAG stack would restart-loop a backend that is
    still serving the parser, scraper and user-details routes correctly. The
    per-store detail is in ``dependencies`` here, and in full on
    /health/sqlite, /health/lmdb, /health/vector and /health/storage -- those
    return 503 when their dependency is genuinely broken.
    """
    mongo_status = "not configured"
    if settings.MONGODB_URI:
        try:
            from .db import MongoDB
            db = MongoDB(settings.MONGODB_URI, settings.MONGODB_DB)
            mongo_status = "connected" if db.connect() else "error"
            db.close()
        except Exception:
            mongo_status = "error"

    return HealthResponse(
        status="ok",
        version=__version__,
        mongodb=mongo_status,
        dependencies=dependency_summary(),
    )


def _sweep_stale_uploads(max_age_hours: int = 6) -> None:
    """Delete leftover temp uploads from previous runs.

    Every route that writes into UPLOAD_DIR removes the file in a finally block,
    but a killed process (SIGKILL, a container restart, a crashed dev reload)
    never runs those, so the directory accumulates whole user documents
    indefinitely. Only files older than max_age_hours are touched, so this can
    never race with an upload that is still being processed by another worker.
    """
    cutoff = time.time() - max_age_hours * 3600
    upload_dir = Path(settings.UPLOAD_DIR)
    removed = 0
    freed = 0
    for entry in upload_dir.glob("*"):
        if not entry.is_file():
            continue
        try:
            stat = entry.stat()
            if stat.st_mtime >= cutoff:
                continue
            freed += stat.st_size
            entry.unlink()
            removed += 1
        except OSError:
            continue
    if removed:
        logger.info("Swept %d stale upload(s) from %s (%.1f MB)", removed, upload_dir, freed / 1024 / 1024)


def _warm_document_converter() -> None:
    """Build the document converter now instead of inside the first upload.

    Constructing Docling's converter loads the layout and table-structure
    models. Built lazily, that cost lands on whoever uploads first after a
    restart: their extraction runs past the frontend's patience and the browser
    reports a connection failure for a backend that is working fine, just slow
    to start. Warming it in a daemon thread keeps startup non-blocking --
    requests arriving during the warm-up simply wait on the same lazy build they
    would have triggered themselves.
    """
    started = time.time()
    try:
        from rag.app.ingest.loader import _get_ocr_engine, get_document_converter
        from rag.core.config import get_config

        if get_config().parser_backend == "docling":
            get_document_converter()
        else:
            _get_ocr_engine()
    except ImportError:
        logger.info("Document parsing dependencies not installed; skipping warm-up")
        return
    except Exception as e:
        # A failed warm-up must not take the API down -- the first real request
        # retries the same build and surfaces the error to its caller.
        logger.warning("Document converter warm-up failed: %s", e)
    else:
        logger.info("Document converter warmed in %.1fs", time.time() - started)


def _start_rag_stack() -> None:
    """Create the storage layout, open the stores, load the indexes, verify them.

    Synchronous and before the first request on purpose: a half-open stack that
    fails on the first search is far harder to diagnose than a process that
    refuses to start. A failure here is logged rather than raised -- the parser,
    scraper and user-details routes do not need the RAG stores, and taking the
    whole API down because a volume is unmounted would be a worse outage than
    the one it reports.
    """
    try:
        from rag.core.services import get_services

        services = get_services()
    except ImportError as e:
        logger.info("RAG dependencies not installed; storage not initialised (%s)", e)
        return
    except Exception:
        logger.exception("RAG storage failed to start -- /api/v1/rag/* will report 503")
        return

    _schedule_backups(services)


def _schedule_backups(services) -> None:
    """Nightly snapshot of FAISS, SQLite and LMDB. PDFs are not duplicated."""
    config = services.config
    if not config.backup_enabled:
        logger.info("Nightly backups disabled (BACKUP_ENABLED=false)")
        return

    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger

        from rag.core.backup import run_backup
    except ImportError:
        logger.warning("APScheduler not installed -- nightly backups disabled")
        return

    scheduler = BackgroundScheduler()
    scheduler.add_job(
        func=lambda: run_backup(services),
        trigger=CronTrigger(hour=config.backup_hour, minute=config.backup_minute),
        id="nightly_rag_backup",
        name="Back up FAISS, SQLite and LMDB",
        replace_existing=True,
        # A backup that overruns its window must not stack up behind itself.
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    app.state.backup_scheduler = scheduler
    logger.info("Nightly backup scheduled for %02d:%02d", config.backup_hour, config.backup_minute)


@app.on_event("startup")
async def on_startup():
    logger.info("Ravenslaw v%s starting on %s:%s", __version__, settings.HOST, settings.PORT)
    if _LOG_PATH:
        logger.info("Logging to %s", _LOG_PATH)
    _sweep_stale_uploads()
    _start_rag_stack()

    if settings.WARM_DOCUMENT_CONVERTER:
        threading.Thread(target=_warm_document_converter, name="docling-warmup", daemon=True).start()
    if settings.MONGODB_URI:
        logger.info("MongoDB configured: %s", settings.MONGODB_DB)
    else:
        logger.info("MongoDB not configured (API-only mode)")

    # Start daily scraper scheduler
    if (
        settings.ENABLE_SCRAPER_SCHEDULER
        and os.getenv("PDF_DOWNLOAD_ENABLED", "false").lower() == "true"
        and settings.MONGODB_URI
    ):
        try:
            from apscheduler.schedulers.background import BackgroundScheduler
            from apscheduler.triggers.cron import CronTrigger
            from .scraper import run_scraper

            scheduler = BackgroundScheduler()
            scheduler.add_job(
                func=run_scraper,
                trigger=CronTrigger(hour=6, minute=0),
                id="daily_pdf_scraper",
                name="Download and parse court PDFs",
                replace_existing=True,
            )
            scheduler.start()
            app.state.scheduler = scheduler
            logger.info("PDF scraper scheduler started (daily at 06:00)")
        except ImportError:
            logger.warning("APScheduler not installed scheduler disabled")
        except Exception as e:
            logger.error("Failed to start scheduler: %s", e)
    elif os.getenv("PDF_DOWNLOAD_ENABLED", "false").lower() == "true":
        logger.info("Scheduler not started (ENABLE_SCRAPER_SCHEDULER=false)")


@app.on_event("shutdown")
async def on_shutdown():
    for attribute in ("scheduler", "backup_scheduler"):
        scheduler = getattr(app.state, attribute, None)
        if scheduler:
            try:
                scheduler.shutdown(wait=False)
            except Exception:
                logger.warning("%s shutdown failed", attribute)

    # Flush the FAISS indexes before the process exits. Vectors added since the
    # last flush live only in memory; SQLite already has their chunk rows, so
    # skipping this leaves the index behind the database until a rebuild.
    try:
        from rag.core.services import is_started, shutdown as shutdown_rag, get_services

        if is_started():
            shutdown_rag(get_services())
    except ImportError:
        pass
    except Exception:
        logger.exception("RAG stack shutdown failed")

    logger.info("Ravenslaw shutting down")
