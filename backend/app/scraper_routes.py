"""
LexVert Scraper API Routes — endpoints for PDF scraper management.
"""

import logging
import os
import re
import uuid
import threading
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from .config import settings
from .scraper import (
    process_single_pdf, run_scraper, _get_db, TEMP_DIR,
    parse_causelist_bulk, get_import_progress, get_running_import_count, get_active_imports_snapshot,
)

logger = logging.getLogger("lexvert.scraper_routes")

scraper_router = APIRouter()


# ─── Request/Response Models ────────────────────────────────────────────────

class BulkParseRequest(BaseModel):
    days_back: int = Field(default=3, ge=1, le=365)  # Default 3 days, max 1 year
    auto_delete_pdfs: bool = True
    start_from_checkpoint: bool = True
    max_pages: Optional[int] = Field(default=None, ge=1, le=200)  # Override pagination limit
    fetch_all_pages: bool = False  # Fetch ALL pages (100+), use with caution


@scraper_router.post("/run-now", summary="Trigger a full scraper run manually")
async def trigger_scraper():
    """Run the scraper immediately (fetch from court website)."""
    try:
        result = await run_in_threadpool(run_scraper)
        return {"success": True, "result": result}
    except Exception:
        logger.exception("Manual scraper trigger failed")
        raise HTTPException(status_code=500, detail="Scraper run failed. Check server logs.")


@scraper_router.post("/upload-and-parse", summary="Upload a PDF and run it through the scraper pipeline")
async def upload_and_parse(file: UploadFile = File(...)):
    """
    Upload a cause list PDF. The scraper pipeline will:
    1. Hash-check for duplicates
    2. Parse all cases
    3. Store in scraped_cases collection
    4. Record in downloaded_pdfs
    5. Delete the temp file
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    content = await file.read()
    max_bytes = settings.MAX_PDF_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File too large. Max {settings.MAX_PDF_SIZE_MB}MB")

    safe_filename = re.sub(r"[^A-Za-z0-9._-]", "_", os.path.basename(file.filename or "upload.pdf"))
    temp_name = f"{uuid.uuid4().hex}_{safe_filename}"
    temp_path = os.path.join(TEMP_DIR, temp_name)

    try:
        with open(temp_path, "wb") as f:
            f.write(content)

        client, db = _get_db()
        result = await run_in_threadpool(process_single_pdf, temp_path, db, "manual_upload")

        # Cleanup
        if os.path.exists(temp_path):
            os.remove(temp_path)
            db["downloaded_pdfs"].update_one(
                {"filename": temp_name},
                {"$set": {"deleted_at": datetime.now(timezone.utc)}},
            )

        client.close()
        return {"success": True, "result": result}

    except Exception:
        logger.exception("Upload-and-parse failed")
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail="Upload and parse failed")


@scraper_router.get("/status", summary="Get scraper status and recent logs")
async def scraper_status():
    """Return recent scraper logs and stats."""
    try:
        client, db = _get_db()

        # Recent logs
        logs = list(
            db["scraper_logs"]
            .find({}, {"_id": 0, "results": 0})
            .sort("run_date", -1)
            .limit(10)
        )
        for log in logs:
            if isinstance(log.get("run_date"), datetime):
                log["run_date"] = log["run_date"].isoformat()

        # Counts
        total_pdfs = db["downloaded_pdfs"].count_documents({})
        completed_pdfs = db["downloaded_pdfs"].count_documents({"parse_status": "completed"})
        failed_pdfs = db["downloaded_pdfs"].count_documents({"parse_status": "failed"})
        total_cases = db["scraped_cases"].count_documents({})

        # Recent PDFs
        recent_pdfs = list(
            db["downloaded_pdfs"]
            .find({}, {"_id": 0})
            .sort("downloaded_at", -1)
            .limit(20)
        )
        for pdf in recent_pdfs:
            for key in ("downloaded_at", "deleted_at"):
                if isinstance(pdf.get(key), datetime):
                    pdf[key] = pdf[key].isoformat()

        client.close()

        return {
            "success": True,
            "stats": {
                "total_pdfs_processed": total_pdfs,
                "completed": completed_pdfs,
                "failed": failed_pdfs,
                "total_cases_extracted": total_cases,
            },
            "recent_logs": logs,
            "recent_pdfs": recent_pdfs,
        }

    except Exception:
        logger.exception("Failed to get scraper status")
        raise HTTPException(status_code=500, detail="Failed to get scraper status")


@scraper_router.get("/cases", summary="Get scraped cases with pagination")
async def get_scraped_cases(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    source_pdf: str = Query(default="", max_length=255),
    search: str = Query(default="", max_length=200),
):
    """Get extracted cases from scraper with pagination and filters."""
    try:
        client, db = _get_db()

        query = {}
        if source_pdf:
            # Validate source_pdf is a simple string, not a MongoDB operator
            if isinstance(source_pdf, str) and not source_pdf.startswith("$"):
                query["source_pdf"] = source_pdf
        if search:
            # Escape regex special characters to prevent ReDoS attacks
            safe_search = re.escape(search)[:200]  # Limit length too
            query["$or"] = [
                {"main_case_no": {"$regex": safe_search, "$options": "i"}},
                {"petitioner": {"$regex": safe_search, "$options": "i"}},
                {"respondent": {"$regex": safe_search, "$options": "i"}},
                {"judge": {"$regex": safe_search, "$options": "i"}},
            ]

        total = db["scraped_cases"].count_documents(query)
        skip = (page - 1) * limit

        cases = list(
            db["scraped_cases"]
            .find(query, {"_id": 0})
            .sort("parsed_at", -1)
            .skip(skip)
            .limit(limit)
        )

        # Serialize datetime fields
        for c in cases:
            if isinstance(c.get("parsed_at"), datetime):
                c["parsed_at"] = c["parsed_at"].isoformat()

        client.close()

        return {
            "success": True,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": (total + limit - 1) // limit,
            "cases": cases,
        }

    except Exception:
        logger.exception("Failed to fetch scraped cases")
        raise HTTPException(status_code=500, detail="Failed to fetch scraped cases")


@scraper_router.get("/logs", summary="Get scraper run logs")
async def get_scraper_logs(limit: int = Query(default=20, ge=1, le=100)):
    """Get detailed scraper run logs."""
    try:
        client, db = _get_db()
        logs = list(
            db["scraper_logs"]
            .find({}, {"_id": 0})
            .sort("run_date", -1)
            .limit(limit)
        )
        for log in logs:
            if isinstance(log.get("run_date"), datetime):
                log["run_date"] = log["run_date"].isoformat()

        client.close()
        return {"success": True, "logs": logs}

    except Exception:
        logger.exception("Failed to fetch scraper logs")
        raise HTTPException(status_code=500, detail="Failed to fetch scraper logs")


# ─── Bulk Causelist Endpoints ───────────────────────────────────────────────


@scraper_router.post("/parse-causelist-bulk", summary="Trigger bulk cause list import")
async def trigger_bulk_causelist(body: BulkParseRequest):
    """
    Start the bulk causelist scraping and parsing workflow.
    Returns immediately with an import_id for progress tracking.
    
    Args (in request body):
        days_back: Number of days to look back (default 3, use 60 for ~2 months)
        auto_delete_pdfs: Delete PDFs after processing
        start_from_checkpoint: Skip already-processed PDFs
        max_pages: Override max pagination pages (each page ~10 PDFs)
        fetch_all_pages: Fetch ALL pages (100+), use with caution
    """
    active_running = get_running_import_count()
    if active_running >= settings.MAX_CONCURRENT_BULK_IMPORTS:
        raise HTTPException(
            status_code=429,
            detail="Maximum concurrent bulk imports reached. Try again later.",
        )

    import_id = str(uuid.uuid4())

    # Run in background thread so the endpoint returns immediately
    thread = threading.Thread(
        target=parse_causelist_bulk,
        kwargs={
            "import_id": import_id,
            "days_back": body.days_back,
            "auto_delete_pdfs": body.auto_delete_pdfs,
            "start_from_checkpoint": body.start_from_checkpoint,
            "max_pages": body.max_pages,
            "fetch_all_pages": body.fetch_all_pages,
        },
        daemon=True,
    )
    thread.start()

    return {
        "success": True,
        "import_id": import_id,
        "status": "started",
        "message": "Import process started. Poll /progress/{import_id} for real-time updates.",
        "parameters": {
            "days_back": body.days_back,
            "max_pages": body.max_pages,
            "fetch_all_pages": body.fetch_all_pages,
        },
    }


@scraper_router.get("/progress/{import_id}", summary="Get import progress")
async def get_progress(import_id: str):
    """Poll for real-time progress of a bulk import."""
    progress = get_import_progress(import_id)
    if not progress:
        raise HTTPException(status_code=404, detail="Import not found")

    return {
        "success": True,
        "import_id": import_id,
        "status": progress["status"],
        "started_at": progress["started_at"],
        "current": progress["current"],
        "log": progress["log"],
        "summary": progress.get("summary"),
    }


@scraper_router.get("/causelist-status", summary="Get causelist import status")
async def causelist_status():
    """Get the last import info and checkpoint status."""
    try:
        client, db = _get_db()

        # Last checkpoint
        checkpoint = db["pdf_tracking"].find_one(
            {"source": "cause_list"}, {"_id": 0}
        )
        if checkpoint:
            for key in ("last_processed_timestamp", "created_at", "updated_at"):
                if isinstance(checkpoint.get(key), datetime):
                    checkpoint[key] = checkpoint[key].isoformat()

        # Last import log
        last_log = db["scraper_logs"].find_one(
            {"import_id": {"$exists": True}},
            {"_id": 0, "results": 0},
            sort=[("run_date", -1)],
        )
        if last_log:
            if isinstance(last_log.get("run_date"), datetime):
                last_log["run_date"] = last_log["run_date"].isoformat()

        # Check if any import is currently running
        current_session = None
        for iid, data in get_active_imports_snapshot().items():
            if data["status"] == "running":
                current_session = {
                    "import_id": iid,
                    "started_at": data["started_at"],
                    "current": data.get("current"),
                }
                break

        client.close()

        return {
            "success": True,
            "last_import": last_log,
            "last_checkpoint": checkpoint,
            "current_session": current_session,
        }

    except Exception:
        logger.exception("Failed to get causelist status")
        raise HTTPException(status_code=500, detail="Failed to get causelist status")


@scraper_router.websocket("/ws/progress/{import_id}")
async def websocket_progress(websocket: WebSocket, import_id: str):
    """WebSocket endpoint for real-time progress updates."""
    await websocket.accept()
    import asyncio

    last_log_len = 0
    try:
        while True:
            progress = get_import_progress(import_id)
            if not progress:
                await websocket.send_json({
                    "type": "error",
                    "message": "Import not found",
                })
                break

            # Send any new log entries
            current_log = progress.get("log", [])
            if len(current_log) > last_log_len:
                for entry in current_log[last_log_len:]:
                    await websocket.send_json(entry)
                last_log_len = len(current_log)

            # Check if completed
            if progress["status"] in ("completed", "failed"):
                if progress.get("summary"):
                    await websocket.send_json({
                        "type": "summary",
                        "data": progress["summary"],
                    })
                break

            await asyncio.sleep(1)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for import %s", import_id)
    except Exception:
        logger.exception("WebSocket error for import %s", import_id)
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
