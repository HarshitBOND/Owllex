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
import sys
import threading
import time
from collections import defaultdict, deque
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from . import __version__
from .config import settings
from .models import HealthResponse
from .rag_routes import rag_router
from .routes import router
from .scraper_routes import scraper_router
from .security import require_internal_token
from .userdetails_routes import userdetails_router

# ─── Logging ─────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("ravenslaw")
_request_buckets = defaultdict(deque)

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
    # In-memory per-IP rate limiting for baseline abuse protection.
    if request.url.path != "/health":
        now = time.time()
        client_ip = request.client.host if request.client else "unknown"
        bucket = _request_buckets[client_ip]
        window_start = now - settings.RATE_LIMIT_WINDOW_SECONDS

        while bucket and bucket[0] < window_start:
            bucket.popleft()

        if len(bucket) >= settings.RATE_LIMIT_MAX_REQUESTS:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded"},
            )

        bucket.append(now)

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
    """Build the Docling converter now instead of inside the first upload.

    Constructing it loads the layout and OCR models and costs ~20s on a warm
    disk (far more when the models still have to be fetched). Built lazily, that
    cost lands on whoever uploads first after a restart: their extraction runs
    past the frontend's patience and the browser reports a connection failure
    for a backend that is working fine, just slowly. Warming it in a daemon
    thread keeps startup non-blocking -- requests arriving during the warm-up
    simply wait on the same lazy build they would have triggered themselves.
    """
    try:
        from rag.app.ingest.loader import _get_converter
    except ImportError:
        logger.info("Docling not installed; skipping converter warm-up")
        return
    started = time.time()
    try:
        _get_converter()
    except Exception as e:
        # A failed warm-up must not take the API down -- the first real request
        # retries the same build and surfaces the error to its caller.
        logger.warning("Document converter warm-up failed: %s", e)
    else:
        logger.info("Document converter warmed in %.1fs", time.time() - started)


@app.on_event("startup")
async def on_startup():
    logger.info("Ravenslaw v%s starting on %s:%s", __version__, settings.HOST, settings.PORT)
    _sweep_stale_uploads()

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
    scheduler = getattr(app.state, "scheduler", None)
    if scheduler:
        try:
            scheduler.shutdown(wait=False)
        except Exception:
            logger.warning("Scheduler shutdown failed")
    logger.info("Ravenslaw shutting down")
