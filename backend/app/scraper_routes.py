"""
LexVert Scraper API Routes — endpoints for PDF scraper management.
"""

import logging
import os
import uuid
import time
import threading
from datetime import datetime, timezone
from dataclasses import asdict
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from .config import settings
from .scraper import (
    process_single_pdf, run_scraper, _get_db, TEMP_DIR,
    parse_causelist_bulk, get_import_progress, _active_imports,
)

logger = logging.getLogger("lexvert.scraper_routes")

scraper_router = APIRouter()


# ─── Request/Response Models ────────────────────────────────────────────────

class BulkParseRequest(BaseModel):
    days_back: int = 3
    auto_delete_pdfs: bool = True
    start_from_checkpoint: bool = True


@scraper_router.post("/run-now", summary="Trigger a full scraper run manually")
async def trigger_scraper():
    """Run the scraper immediately (fetch from court website)."""
    try:
        result = run_scraper()
        return {"success": True, "result": result}
    except Exception as e:
        logger.exception("Manual scraper trigger failed")
        raise HTTPException(status_code=500, detail=str(e))


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

    temp_name = f"{uuid.uuid4().hex}_{file.filename}"
    temp_path = os.path.join(TEMP_DIR, temp_name)

    try:
        with open(temp_path, "wb") as f:
            f.write(content)

        client, db = _get_db()
        result = process_single_pdf(temp_path, db, source_url="manual_upload")

        # Cleanup
        if os.path.exists(temp_path):
            os.remove(temp_path)
            db["downloaded_pdfs"].update_one(
                {"filename": temp_name},
                {"$set": {"deleted_at": datetime.now(timezone.utc)}},
            )

        client.close()
        return {"success": True, "result": result}

    except Exception as e:
        logger.exception("Upload-and-parse failed")
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail=str(e))


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

    except Exception as e:
        logger.exception("Failed to get scraper status")
        raise HTTPException(status_code=500, detail=str(e))


@scraper_router.get("/cases", summary="Get scraped cases with pagination")
async def get_scraped_cases(
    page: int = 1,
    limit: int = 50,
    source_pdf: str = "",
    search: str = "",
):
    """Get extracted cases from scraper with pagination and filters."""
    try:
        client, db = _get_db()

        query = {}
        if source_pdf:
            query["source_pdf"] = source_pdf
        if search:
            query["$or"] = [
                {"main_case_no": {"$regex": search, "$options": "i"}},
                {"petitioner": {"$regex": search, "$options": "i"}},
                {"respondent": {"$regex": search, "$options": "i"}},
                {"judge": {"$regex": search, "$options": "i"}},
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

    except Exception as e:
        logger.exception("Failed to fetch scraped cases")
        raise HTTPException(status_code=500, detail=str(e))


@scraper_router.get("/logs", summary="Get scraper run logs")
async def get_scraper_logs(limit: int = 20):
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

    except Exception as e:
        logger.exception("Failed to fetch scraper logs")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Bulk Causelist Endpoints ───────────────────────────────────────────────


@scraper_router.post("/parse-causelist-bulk", summary="Trigger bulk cause list import")
async def trigger_bulk_causelist(body: BulkParseRequest):
    """
    Start the bulk causelist scraping and parsing workflow.
    Returns immediately with an import_id for progress tracking.
    """
    import_id = str(uuid.uuid4())

    # Run in background thread so the endpoint returns immediately
    thread = threading.Thread(
        target=parse_causelist_bulk,
        kwargs={
            "import_id": import_id,
            "days_back": body.days_back,
            "auto_delete_pdfs": body.auto_delete_pdfs,
            "start_from_checkpoint": body.start_from_checkpoint,
        },
        daemon=True,
    )
    thread.start()

    return {
        "success": True,
        "import_id": import_id,
        "status": "started",
        "message": "Import process started. Poll /progress/{import_id} for real-time updates.",
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
        for iid, data in _active_imports.items():
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

    except Exception as e:
        logger.exception("Failed to get causelist status")
        raise HTTPException(status_code=500, detail=str(e))


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
    except Exception as e:
        logger.error("WebSocket error for import %s: %s", import_id, e)
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
