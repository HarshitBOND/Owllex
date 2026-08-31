"""
LexVert API Routes - RAG document ingestion, retrieval and health.
"""

import logging
import os
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from .config import settings

logger = logging.getLogger("lexvert.rag")

rag_router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".jpg", ".jpeg", ".png"}


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    k: int = Field(5, ge=1, le=20)


class CorpusSearchRequest(BaseModel):
    corpus_id: str = Field(..., min_length=1, max_length=64)
    clerk_uid: str = Field(..., min_length=1, max_length=128)
    query: str = Field(..., min_length=1, max_length=1000)
    k: int = Field(5, ge=1, le=20)


class CorpusDeleteRequest(BaseModel):
    corpus_id: str = Field(..., min_length=1, max_length=64)
    clerk_uid: str = Field(..., min_length=1, max_length=128)
    document_id: str | None = None


def _corpus_where(corpus_id, clerk_uid, document_id=None):
    """Chroma needs an explicit $and for multi-key filters -- a bare multi-key dict is
    silently wrong, and getting this wrong would leak one advocate's papers to another."""
    clauses = [{"corpus_id": {"$eq": corpus_id}}, {"clerk_uid": {"$eq": clerk_uid}}]
    if document_id:
        clauses.append({"document_id": {"$eq": document_id}})
    return {"$and": clauses}


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
    description=(
        "Upload a document (or, for a photographed multi-page document, its ordered page images "
        "under repeated `files` fields); it is chunked, embedded, and stored in the Chroma vector store."
    ),
)
async def ingest_rag_document(
    file: UploadFile | None = File(default=None, description="Single document (legacy single-file path)"),
    files: list[UploadFile] | None = File(default=None, description="Ordered pages of one physical document"),
):
    # `files` is the general path (also used for a single non-grouped upload by the Next proxy);
    # `file` is kept only because rag/scripts/verify_rag.py still posts that legacy shape directly.
    uploads = files if files else ([file] if file else [])
    if not uploads:
        raise HTTPException(status_code=400, detail="No file provided")

    for upload in uploads:
        if not upload.filename or Path(upload.filename).suffix.lower() not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail="Only PDF, DOCX, TXT, MD, JPG, or PNG files are accepted")

    _require_openai_key()
    _require_chroma_config()

    document_id = uuid.uuid4().hex
    max_bytes = settings.MAX_PDF_SIZE_MB * 1024 * 1024
    raw_name = Path(uploads[0].filename).name
    temp_paths: list[str] = []
    total_bytes = 0

    try:
        for idx, upload in enumerate(uploads):
            content = await upload.read()
            total_bytes += len(content)
            if total_bytes > max_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"Combined document size exceeds {settings.MAX_PDF_SIZE_MB}MB",
                )

            safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", Path(upload.filename).name)
            temp_path = os.path.join(settings.UPLOAD_DIR, f"{document_id}_{idx:03d}_{safe_name}")
            with open(temp_path, "wb") as f:
                f.write(content)
            temp_paths.append(temp_path)

        try:
            from rag.app.ingest.ingest import ingest_document
        except ImportError:
            raise HTTPException(
                status_code=503,
                detail="RAG dependencies are not installed on this instance (run: uv sync --extra rag)",
            )

        result = await run_in_threadpool(ingest_document, temp_paths, document_id)

        if result.get("skipped"):
            logger.info("Rejected %s: duplicate content (hash=%s)", raw_name, result["content_hash"])
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "This document has already been ingested (duplicate content).",
                    "existing_document_id": result["existing_document_id"],
                    "content_hash": result["content_hash"],
                },
            )

        logger.info(
            "Ingested %s (%d page(s)) as document_id=%s (%d chunks)",
            raw_name, len(uploads), document_id, result["chunk_count"],
        )

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
        for temp_path in temp_paths:
            if os.path.exists(temp_path):
                os.remove(temp_path)


@rag_router.post(
    "/documents/extract",
    summary="Extract text from a document",
    description=(
        "Runs Docling (with OCR fallback for scans/images) on a single uploaded document and "
        "returns the extracted markdown text. Does not chunk, embed, or store anything, so it "
        "works even without OPENAI_API_KEY or Chroma configured."
    ),
)
async def extract_document_text(file: UploadFile = File(...)):
    if not file.filename or Path(file.filename).suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, TXT, MD, JPG, or PNG files are accepted")

    max_bytes = settings.MAX_PDF_SIZE_MB * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.MAX_PDF_SIZE_MB}MB")

    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", Path(file.filename).name)
    temp_path = os.path.join(settings.UPLOAD_DIR, f"{uuid.uuid4().hex}_{safe_name}")

    try:
        with open(temp_path, "wb") as f:
            f.write(content)

        try:
            from rag.app.ingest.loader import load_text
        except ImportError:
            raise HTTPException(
                status_code=503,
                detail="RAG dependencies are not installed on this instance (run: uv sync --extra rag)",
            )

        text = await run_in_threadpool(load_text, temp_path)
        if not text or not text.strip():
            raise HTTPException(status_code=422, detail="Nothing extractable in this document")

        return {"success": True, "text": text}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Document extraction failed for %s", file.filename)
        raise HTTPException(status_code=500, detail=f"Extraction failed: {e}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@rag_router.post(
    "/corpus/ingest",
    summary="Ingest a document into one user's corpus",
    description=(
        "Same pipeline as /ingest, but the chunks land in the per-user collection tagged with "
        "corpus_id and clerk_uid, and the dedupe hash is namespaced to the corpus so two "
        "advocates can each index the same file."
    ),
)
async def ingest_corpus_document(
    corpus_id: str = Form(...),
    clerk_uid: str = Form(...),
    document_id: str = Form(...),
    files: list[UploadFile] = File(...),
):
    if not files:
        raise HTTPException(status_code=400, detail="No file provided")

    for upload in files:
        if not upload.filename or Path(upload.filename).suffix.lower() not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail="Only PDF, DOCX, TXT, MD, JPG, or PNG files are accepted")

    _require_openai_key()
    _require_chroma_config()

    max_bytes = settings.MAX_PDF_SIZE_MB * 1024 * 1024
    raw_name = Path(files[0].filename).name
    temp_paths: list[str] = []
    total_bytes = 0

    try:
        for idx, upload in enumerate(files):
            content = await upload.read()
            total_bytes += len(content)
            if total_bytes > max_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"Combined document size exceeds {settings.MAX_PDF_SIZE_MB}MB",
                )

            safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", Path(upload.filename).name)
            temp_path = os.path.join(settings.UPLOAD_DIR, f"{document_id}_{idx:03d}_{safe_name}")
            with open(temp_path, "wb") as f:
                f.write(content)
            temp_paths.append(temp_path)

        try:
            from rag.app.ingest.ingest import ingest_document
            from rag.app.ingest.vector_db import USER_COLLECTION
        except ImportError:
            raise HTTPException(
                status_code=503,
                detail="RAG dependencies are not installed on this instance (run: uv sync --extra rag)",
            )

        result = await run_in_threadpool(
            ingest_document,
            temp_paths,
            document_id,
            USER_COLLECTION,
            {"corpus_id": corpus_id, "clerk_uid": clerk_uid},
            corpus_id,
        )

        if result.get("skipped"):
            return {
                "success": True,
                "document_id": result["existing_document_id"],
                "filename": raw_name,
                "chunk_count": 0,
                "duplicate": True,
            }

        logger.info(
            "Ingested %s into corpus %s as document_id=%s (%d chunks)",
            raw_name, corpus_id, document_id, result["chunk_count"],
        )
        return {"success": True, "document_id": document_id, "filename": raw_name, **result}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Corpus ingestion failed for %s", raw_name)
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}")
    finally:
        for temp_path in temp_paths:
            if os.path.exists(temp_path):
                os.remove(temp_path)


@rag_router.post(
    "/corpus/search",
    summary="Search one user's corpus",
    description="Retrieves only chunks tagged with both this corpus_id and this clerk_uid.",
)
async def corpus_search(payload: CorpusSearchRequest):
    _require_openai_key()
    _require_chroma_config()

    def _search():
        from rag.app.ingest.vector_db import USER_COLLECTION, get_vector_db

        return get_vector_db(USER_COLLECTION).similarity_search_with_score(
            payload.query,
            k=payload.k,
            filter=_corpus_where(payload.corpus_id, payload.clerk_uid),
        )

    try:
        hits = await run_in_threadpool(_search)
    except ImportError:
        raise HTTPException(status_code=503, detail="RAG dependencies are not installed on this instance")
    except Exception as e:
        logger.exception("Corpus search failed")
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
    "/corpus/delete",
    summary="Delete a corpus's chunks",
    description="Removes every chunk for a corpus, or just one document within it.",
)
async def corpus_delete(payload: CorpusDeleteRequest):
    _require_chroma_config()

    def _delete():
        from rag.app.ingest.vector_db import USER_COLLECTION, delete_by

        delete_by(
            _corpus_where(payload.corpus_id, payload.clerk_uid, payload.document_id),
            USER_COLLECTION,
        )

    try:
        await run_in_threadpool(_delete)
    except ImportError:
        raise HTTPException(status_code=503, detail="RAG dependencies are not installed on this instance")
    except Exception as e:
        logger.exception("Corpus delete failed")
        raise HTTPException(status_code=500, detail=f"Delete failed: {e}")

    return {"success": True}
