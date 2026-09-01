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
import time
from collections import defaultdict, deque

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


@app.on_event("startup")
async def on_startup():
    logger.info("Ravenslaw v%s starting on %s:%s", __version__, settings.HOST, settings.PORT)
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
            logger.warning("APScheduler not installed — scheduler disabled")
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
