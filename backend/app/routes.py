"""
LexVert API Routes — FastAPI endpoints for cause list parsing.
"""

import logging
import os
import re
import time
import uuid
from dataclasses import asdict
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool

from .config import settings
from .models import CaseResponse, ErrorResponse, ParseResponse
from .parser import parse_pdf

logger = logging.getLogger("lexvert.routes")

router = APIRouter()


@router.post(
    "/parse",
    response_model=ParseResponse,
    responses={400: {"model": ErrorResponse}, 413: {"model": ErrorResponse}},
    summary="Parse a DHC cause list PDF",
    description="Upload a Delhi High Court cause list PDF and get structured case data back.",
)
async def parse_cause_list(
    file: UploadFile = File(..., description="DHC cause list PDF file"),
    save_to_db: bool = Query(False, description="Also insert parsed cases into MongoDB"),
):
    """Parse an uploaded PDF and return structured case data as JSON."""

    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    # Read and validate size
    content = await file.read()
    max_bytes = settings.MAX_PDF_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size: {settings.MAX_PDF_SIZE_MB}MB",
        )

    # Save to temp file for pdfplumber (requires file path)
    raw_name = Path(file.filename or "upload.pdf").name
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", raw_name)
    temp_name = f"{uuid.uuid4().hex}_{safe_name}"
    temp_path = os.path.join(settings.UPLOAD_DIR, temp_name)

    try:
        with open(temp_path, "wb") as f:
            f.write(content)

        start = time.time()
        cases = await run_in_threadpool(parse_pdf, temp_path)
        elapsed = time.time() - start

        logger.info(
            "Parsed %s: %d cases in %.2fs",
            file.filename, len(cases), elapsed,
        )

        # Optional MongoDB insert
        if save_to_db and not settings.MONGODB_URI:
            raise HTTPException(status_code=503, detail="MongoDB is not configured")

        if save_to_db and settings.MONGODB_URI:
            from .db import MongoDB
            db = MongoDB(settings.MONGODB_URI, settings.MONGODB_DB)
            if not db.connect():
                raise HTTPException(status_code=503, detail="Failed to connect to MongoDB")

            insert_result = db.insert_cases(cases)
            if insert_result.get("error"):
                db.close()
                raise HTTPException(status_code=503, detail="Failed to insert records into MongoDB")
            db.close()

        return ParseResponse(
            success=True,
            filename=file.filename,
            total_cases=len(cases),
            cases=[CaseResponse(**asdict(c)) for c in cases],
        )

    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to parse %s", file.filename)
        raise HTTPException(status_code=400, detail="Failed to parse PDF file")

    finally:
        # Clean up temp file
        if os.path.exists(temp_path):
            os.remove(temp_path)


