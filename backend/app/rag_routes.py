"""
LexVert API Routes - RAG document ingestion, retrieval and health.
"""

import logging
import os
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from .config import settings

logger = logging.getLogger("lexvert.rag")

rag_router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    k: int = Field(5, ge=1, le=20)


def _require_openai_key():
    if not settings.OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not configured on the backend. Add it to backend/.env and restart.",
        )


def _require_chroma_config():
    if not (os.getenv("CHROMA_API_KEY") and os.getenv("CHROMA_TENANT") and os.getenv("CHROMA_DATABASE")):
        raise HTTPException(
            status_code=503,
            detail=(
                "Chroma Cloud is not configured on the backend. Add CHROMA_API_KEY, "
                "CHROMA_TENANT, and CHROMA_DATABASE to backend/.env and restart."
            ),
        )


@rag_router.get(
    "/status",
    summary="RAG pipeline health",
    description="Reports whether the pipeline is ready and how much is indexed. Never fails hard - it is a diagnostic.",
)
async def rag_status():
    def _collect():
        status = {
            "openai_key_configured": bool(settings.OPENAI_API_KEY),
            "chroma_configured": bool(os.getenv("CHROMA_API_KEY")),
            "dependencies_installed": False,
            "chunk_count": 0,
            "document_count": 0,
            "indexed_hashes": 0,
            "chroma_database": os.getenv("CHROMA_DATABASE") or None,
            "error": None,
        }
        try:
            from rag import hash_db
            from rag.app.ingest.vector_db import collection_stats

            status["dependencies_installed"] = True
            status["indexed_hashes"] = hash_db.count()
            status.update(collection_stats())
        except ImportError as e:
            status["error"] = f"RAG dependencies not installed (run: uv sync --extra rag): {e}"
        except Exception as e:
            status["error"] = str(e)
        return status

    result = await run_in_threadpool(_collect)
    result["ready"] = (
        result["openai_key_configured"]
        and result["chroma_configured"]
        and result["dependencies_installed"]
        and not result["error"]
    )
    return result


@rag_router.post(
    "/search",
    summary="Search the RAG vector store",
    description="Embeds the query and returns the closest stored chunks. Use it to verify ingestion worked.",
)
async def rag_search(payload: SearchRequest):
    _require_openai_key()
    _require_chroma_config()

    def _search():
        from rag.app.ingest.vector_db import get_vector_db

        return get_vector_db().similarity_search_with_score(payload.query, k=payload.k)

    try:
        hits = await run_in_threadpool(_search)
    except ImportError:
        raise HTTPException(status_code=503, detail="RAG dependencies are not installed on this instance")
    except Exception as e:
        logger.exception("RAG search failed")
        raise HTTPException(status_code=500, detail=f"Search failed: {e}")

    return {
        "success": True,
        "query": payload.query,
        "count": len(hits),
        "results": [
            {
                "text": doc.page_content,
                "score": float(score),
                "document_id": doc.metadata.get("document_id"),
                "title": doc.metadata.get("title"),
                "document_type": doc.metadata.get("document_type"),
                "date": doc.metadata.get("date"),
                "source_url": doc.metadata.get("source_url") or None,
            }
            for doc, score in hits
        ],
    }


@rag_router.post(
    "/ingest",
    summary="Ingest a document into the RAG vector store",
    description="Upload a document; it is chunked, embedded, and stored in the Chroma vector store.",
)
async def ingest_rag_document(file: UploadFile = File(..., description="Document to ingest")):
    if not file.filename or Path(file.filename).suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, TXT, or MD files are accepted")

    _require_openai_key()
    _require_chroma_config()

    content = await file.read()
    max_bytes = settings.MAX_PDF_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size: {settings.MAX_PDF_SIZE_MB}MB",
        )

    raw_name = Path(file.filename).name
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", raw_name)
    document_id = uuid.uuid4().hex
    temp_path = os.path.join(settings.UPLOAD_DIR, f"{document_id}_{safe_name}")

    try:
        with open(temp_path, "wb") as f:
            f.write(content)

        try:
            from rag.app.ingest.ingest import ingest_document
        except ImportError:
            raise HTTPException(
                status_code=503,
                detail="RAG dependencies are not installed on this instance (run: uv sync --extra rag)",
            )

        result = await run_in_threadpool(ingest_document, temp_path, document_id)

        if result.get("skipped"):
            logger.info("Skipped %s: duplicate content (hash=%s)", raw_name, result["content_hash"])
        else:
            logger.info("Ingested %s as document_id=%s (%d chunks)", raw_name, document_id, result["chunk_count"])

        return {
            "success": True,
            "document_id": document_id,
            "filename": raw_name,
            **result,
        }
    except HTTPException:
        raise
    except ValueError as e:
        # Nothing extractable in the document - a user-fixable problem, not a server fault.
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("RAG ingestion failed for %s", raw_name)
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
