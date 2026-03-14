"""
LexVert API Routes — FastAPI endpoints for cause list parsing.
"""

import logging
import os
import time
import uuid
from dataclasses import asdict
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

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
    temp_name = f"{uuid.uuid4().hex}_{file.filename}"
    temp_path = os.path.join(settings.UPLOAD_DIR, temp_name)

    try:
        with open(temp_path, "wb") as f:
            f.write(content)

        start = time.time()
        cases = parse_pdf(temp_path)
        elapsed = time.time() - start

        logger.info(
            "Parsed %s: %d cases in %.2fs",
            file.filename, len(cases), elapsed,
        )

        # Optional MongoDB insert
        db_result = None
        if save_to_db and settings.MONGODB_URI:
            from .db import MongoDB
            db = MongoDB(settings.MONGODB_URI, settings.MONGODB_DB)
            if db.connect():
                db_result = db.insert_cases(cases)
                db.close()

        return ParseResponse(
            success=True,
            filename=file.filename,
            total_cases=len(cases),
            cases=[CaseResponse(**asdict(c)) for c in cases],
        )

    except Exception as e:
        logger.exception("Failed to parse %s", file.filename)
        raise HTTPException(status_code=400, detail=str(e))

    finally:
        # Clean up temp file
        if os.path.exists(temp_path):
            os.remove(temp_path)


@router.post(
    "/parse/path",
    response_model=ParseResponse,
    responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
    summary="Parse a PDF from server path",
    description="Parse a cause list PDF already on the server (for internal/cron use).",
)
async def parse_from_path(
    pdf_path: str = Query(..., description="Absolute or relative path to the PDF on server"),
    save_to_db: bool = Query(False, description="Also insert parsed cases into MongoDB"),
):
    """Parse a PDF already on the server filesystem."""

    if not os.path.isfile(pdf_path):
        raise HTTPException(status_code=404, detail=f"File not found: {pdf_path}")

    try:
        start = time.time()
        cases = parse_pdf(pdf_path)
        elapsed = time.time() - start

        logger.info(
            "Parsed %s: %d cases in %.2fs",
            pdf_path, len(cases), elapsed,
        )

        if save_to_db and settings.MONGODB_URI:
            from .db import MongoDB
            db = MongoDB(settings.MONGODB_URI, settings.MONGODB_DB)
            if db.connect():
                db.insert_cases(cases)
                db.close()

        return ParseResponse(
            success=True,
            filename=os.path.basename(pdf_path),
            total_cases=len(cases),
            cases=[CaseResponse(**asdict(c)) for c in cases],
        )

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {pdf_path}")
    except Exception as e:
        logger.exception("Failed to parse %s", pdf_path)
        raise HTTPException(status_code=400, detail=str(e))
