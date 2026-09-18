"""
Ravenslaw API Routes - RAG document ingestion, retrieval and health.

Every response shape here is a contract with the Next app (see
app/api/lib/{corpusBackend,judgmentsBackend,contractExtract}.ts and
features/admin). The storage layer underneath was replaced wholesale --
Chroma Cloud and R2 out, FAISS + SQLite + LMDB on a mounted volume in --
without changing those shapes. The one place the payload did change is
/status, which reported Chroma-specific fields that no longer exist.
"""

import hashlib
import json
import logging
import os
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .config import settings

logger = logging.getLogger("ravenslaw.rag")

rag_router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".jpg", ".jpeg", ".png"}

# Raised as a 503 whenever the RAG extra is not installed on this instance.
_MISSING_DEPENDENCIES = "RAG dependencies are not installed on this instance (run: uv sync --extra rag)"


def _opaque_error(status_code: int, public_message: str, log_message: str) -> HTTPException:
    """A 5xx `HTTPException` whose body carries a fixed message and a
    correlation id -- never the exception itself.

    PRODUCTION_TODO.md T19a, Bug B: `detail=f"Search failed: {exc}"` and its
    several siblings across this file put filesystem paths, SQLite messages
    naming columns, and FAISS assertions naming source files straight into
    the HTTP response. The full traceback already goes to the log via
    `logger.exception` below (whose whole point is that it reads the *active*
    exception via `sys.exc_info()` -- this must only ever be called from
    inside the `except` block it is reporting on, same as calling
    `logger.exception` directly would require); the response body only needs
    something an operator can `grep` the log for, which is what `reference`
    is. Not applied to the `_MISSING_DEPENDENCIES` 503s: that message is
    already fixed and actionable and names no internals, so there is nothing
    here to fix for it, and not applied to 4xx validation messages (a known
    file-size ceiling, a malformed field) that were never exception text to
    begin with.
    """
    reference = uuid.uuid4().hex[:12]
    logger.exception("%s (reference=%s)", log_message, reference)
    return HTTPException(status_code=status_code, detail=f"{public_message} (reference: {reference})")


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    k: int = Field(5, ge=1, le=20)


class JudgmentSearchRequest(BaseModel):
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


def _services():
    """The started RAG container, or a 503 naming what is missing.

    Startup is lazy and idempotent: the first RAG request builds the stack
    (directories, SQLite, LMDB, FAISS) if the application lifespan hook has not
    already done so, so a cold instance answers correctly rather than 500ing.
    """
    try:
        from rag.core.services import get_services
    except ImportError:
        # The exception text used to be appended here too (an ImportError
        # naming the missing module) -- dropped for the same reason as every
        # other site below: the log line already has it, via `logger.exception`.
        logger.exception("RAG dependencies not installed")
        raise HTTPException(status_code=503, detail=_MISSING_DEPENDENCIES)

    try:
        return get_services()
    except HTTPException:
        raise
    except Exception:
        raise _opaque_error(503, "RAG storage is unavailable", "RAG stack failed to start")


def _retriever():
    from rag.app.retrieval.retriever import Retriever

    return Retriever(_services())


# ─── Health ──────────────────────────────────────────────────────────────────


@rag_router.get(
    "/status",
    summary="RAG pipeline health",
    description="Reports whether the pipeline is ready and how much is indexed. Never fails hard - it is a diagnostic.",
)
async def rag_status():
    def _collect():
        status = {
            "vector_store": "faiss",
            "embed_model": None,
            "embed_dim": None,
            "dependencies_installed": False,
            "storage_ready": False,
            "chunk_count": 0,
            "document_count": 0,
            "indexed_hashes": 0,
            "collections": {},
            "data_root": None,
            "disk_free_bytes": None,
            "error": None,
        }
        try:
            from rag.core.services import get_services

            services = get_services()
            status["dependencies_installed"] = True
            status["storage_ready"] = True
            status["embed_model"] = services.embedder.model_name
            status["embed_dim"] = services.embedder.dimension
            status["data_root"] = str(services.config.data_root)
            status["indexed_hashes"] = services.hashes.count()
            status["collections"] = services.indexes.counts()
            status.update(services.metadata.stats())
            status.update(
                {k: v for k, v in services.documents.usage().items() if k == "disk_free_bytes"}
            )
        except ImportError as exc:
            status["error"] = f"RAG dependencies not installed (run: uv sync --extra rag): {exc}"
        except Exception as exc:
            status["error"] = str(exc)
        return status

    result = await run_in_threadpool(_collect)
    result["ready"] = (
        result["dependencies_installed"] and result["storage_ready"] and not result["error"]
    )
    return result


# ─── Search ──────────────────────────────────────────────────────────────────


def _hit_payload(hit, include_storage_ref: bool = False) -> dict:
    """The result shape every search endpoint has returned since Chroma."""
    payload = {
        "text": hit.text,
        "score": float(hit.score),
        "document_id": hit.document_id,
        "title": hit.title,
        "document_type": hit.document_type,
        "date": hit.date,
        "source_url": hit.source_url or None,
    }
    if include_storage_ref:
        payload["storage_ref"] = hit.storage_ref or None
    return payload


async def _run_search(label: str, search):
    """Run a retrieval callable off the event loop, mapping failures to status codes."""
    try:
        return await run_in_threadpool(search)
    except HTTPException:
        raise
    except ImportError:
        raise HTTPException(status_code=503, detail=_MISSING_DEPENDENCIES)
    except Exception:
        raise _opaque_error(500, "Search failed", f"{label} failed")


@rag_router.post(
    "/search",
    summary="Search the RAG vector store",
    description="Embeds the query and returns the closest stored chunks. Use it to verify ingestion worked.",
)
async def rag_search(payload: SearchRequest):
    retriever = _retriever()
    # The public corpus. This endpoint is an admin diagnostic and deliberately
    # has no owner scope -- so it must never be able to reach a private document,
    # which search_public guarantees by searching only the public id partition.
    hits = await _run_search("RAG search", lambda: retriever.search_public(payload.query, payload.k))
    return {
        "success": True,
        "query": payload.query,
        "count": len(hits),
        "results": [_hit_payload(hit) for hit in hits],
    }


@rag_router.post(
    "/judgments/search",
    summary="Search the public judgments/laws collection",
    description=(
        "Embeds the query and returns the closest chunks from the public corpus. "
        "Used by the AI chat to find and cite judgments/laws for any authenticated user; "
        "callers are expected to turn document_id + storage_ref into a scoped, expiring "
        "viewer link rather than exposing them directly."
    ),
)
async def judgment_search(payload: JudgmentSearchRequest):
    retriever = _retriever()
    hits = await _run_search(
        "Judgment search",
        lambda: retriever.search_public(payload.query, payload.k),
    )
    return {
        "success": True,
        "query": payload.query,
        "count": len(hits),
        "results": [_hit_payload(hit, include_storage_ref=True) for hit in hits],
    }


@rag_router.post(
    "/corpus/search",
    summary="Search one user's corpus",
    description="Retrieves only chunks tagged with both this corpus_id and this clerk_uid.",
)
async def corpus_search(payload: CorpusSearchRequest):
    retriever = _retriever()
    hits = await _run_search(
        "Corpus search",
        lambda: retriever.search_corpus(
            payload.query, payload.corpus_id, payload.clerk_uid, payload.k
        ),
    )
    return {
        "success": True,
        "query": payload.query,
        "count": len(hits),
        "results": [_hit_payload(hit) for hit in hits],
    }


@rag_router.post(
    "/corpus/delete",
    summary="Delete a corpus's chunks",
    description="Removes every chunk for a corpus, or just one document within it.",
)
async def corpus_delete(payload: CorpusDeleteRequest):
    services = _services()

    def _delete():
        from rag.app.retrieval.retriever import delete_corpus_documents

        return delete_corpus_documents(
            services, payload.corpus_id, payload.clerk_uid, payload.document_id
        )

    try:
        await run_in_threadpool(_delete)
    except ImportError:
        raise HTTPException(status_code=503, detail=_MISSING_DEPENDENCIES)
    except Exception:
        raise _opaque_error(500, "Delete failed", "Corpus delete failed")

    return {"success": True}


# ─── Ingestion ───────────────────────────────────────────────────────────────


def _validate_uploads(uploads: list[UploadFile]) -> None:
    for upload in uploads:
        if not upload.filename or Path(upload.filename).suffix.lower() not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail="Only PDF, DOCX, TXT, MD, JPG, or PNG files are accepted",
            )


async def _enqueue_ingest(
    services,
    uploads: list[UploadFile],
    *,
    document_id: str,
    collection: str | None = None,
    extra_metadata: dict | None = None,
    dedupe_scope: str = "",
    persist_source: bool = True,
    court_hint: str | None = None,
) -> str:
    """Spool an upload into INBOX_ROOT and enqueue an ingest job.

    Returns a ``job_id`` a caller polls at ``GET /jobs/{job_id}``. This
    function never touches FAISS or runs the pipeline -- the ingest worker
    (``rag/scripts/ingest_worker.py``) is the only process that does either,
    which is what makes it the sole writer. See PRODUCTION_TODO.md T2.

    Every file is written under its own ``job_id`` directory so two jobs can
    never collide, spooled to a ``.part`` sibling and atomically renamed so
    the worker never sees a half-written file under its final name, then
    described by one ``job.manifest.json`` the worker reads instead of
    deriving these fields from the file's position in the inbox tree.
    """
    from rag.scripts.ingest_worker import MANIFEST_FILENAME

    max_bytes = settings.MAX_PDF_SIZE_MB * 1024 * 1024
    job_id = uuid.uuid4().hex
    job_dir = Path(services.config.inbox_root) / "api" / job_id

    spooled: list[Path] = []
    try:
        job_dir.mkdir(parents=True, exist_ok=True)
        total_bytes = 0
        for index, upload in enumerate(uploads):
            content = await upload.read()
            total_bytes += len(content)
            if total_bytes > max_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"Combined document size exceeds {settings.MAX_PDF_SIZE_MB}MB",
                )
            safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", Path(upload.filename).name)
            dest = job_dir / f"{index:03d}_{safe_name}"
            tmp = dest.with_name(dest.name + ".part")
            with open(tmp, "wb") as handle:
                handle.write(content)
            os.replace(tmp, dest)
            spooled.append(dest)

        manifest = {
            "job_id": job_id,
            "document_id": document_id,
            "paths": [p.name for p in spooled],
            "collection": collection,
            "extra_metadata": extra_metadata or {},
            "dedupe_scope": dedupe_scope,
            "persist_source": persist_source,
            "court_hint": court_hint,
        }
        manifest_path = job_dir / MANIFEST_FILENAME
        tmp_manifest = manifest_path.with_name(manifest_path.name + ".part")
        tmp_manifest.write_text(json.dumps(manifest), encoding="utf-8")
        os.replace(tmp_manifest, manifest_path)

        services.metadata.create_ingest_job(job_id, filename=Path(uploads[0].filename).name)
    except Exception:
        for path in spooled:
            _remove(str(path))
        raise

    return job_id


@rag_router.post(
    "/ingest",
    status_code=202,
    summary="Enqueue a document for ingestion into the RAG vector store",
    description=(
        "Upload a document (or, for a photographed multi-page document, its ordered page images "
        "under repeated `files` fields). The file is spooled for the ingest worker and a job_id "
        "returned immediately; poll GET /api/v1/rag/jobs/{job_id} for the result. The worker is "
        "the sole FAISS writer (PRODUCTION_TODO.md T2), so this never runs the pipeline inline."
    ),
)
async def ingest_rag_document(
    file: UploadFile | None = File(default=None, description="Single document (legacy single-file path)"),
    files: list[UploadFile] | None = File(default=None, description="Ordered pages of one physical document"),
    court: str = Form(default="", description="Court this document belongs to, when the caller knows it"),
):
    # `files` is the general path (also used for a single non-grouped upload by the Next proxy);
    # `file` is kept only because rag/scripts/verify_rag.py still posts that legacy shape directly.
    uploads = files if files else ([file] if file else [])
    if not uploads:
        raise HTTPException(status_code=400, detail="No file provided")
    _validate_uploads(uploads)

    services = _services()
    raw_name = Path(uploads[0].filename).name
    document_id = uuid.uuid4().hex

    try:
        job_id = await _enqueue_ingest(
            services,
            uploads,
            document_id=document_id,
            court_hint=court or None,
        )
    except HTTPException:
        raise
    except Exception:
        raise _opaque_error(500, "Could not enqueue ingestion", f"Could not enqueue RAG ingestion for {raw_name}")

    logger.info("Enqueued %s (%d page(s)) as job_id=%s", raw_name, len(uploads), job_id)
    return {"job_id": job_id, "status": "queued", "filename": raw_name}


@rag_router.post(
    "/corpus/ingest",
    status_code=202,
    summary="Enqueue a document for ingestion into one user's corpus",
    description=(
        "Same pipeline as /ingest, but the chunks land in the per-user collection tagged with "
        "corpus_id and clerk_uid, and the dedupe hash is namespaced to the corpus so two "
        "advocates can each index the same file. Poll GET /api/v1/rag/jobs/{job_id} for the result."
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
    _validate_uploads(files)

    services = _services()
    raw_name = Path(files[0].filename).name

    try:
        from rag.core.vector_index import USER_COLLECTION

        job_id = await _enqueue_ingest(
            services,
            files,
            document_id=document_id,
            collection=USER_COLLECTION,
            extra_metadata={"corpus_id": corpus_id, "clerk_uid": clerk_uid},
            dedupe_scope=corpus_id,
            # Private corpus documents are already stored, with access
            # control, by the caller; they must not also land in the
            # public corpus archive.
            persist_source=False,
        )
    except HTTPException:
        raise
    except Exception:
        raise _opaque_error(500, "Could not enqueue ingestion", f"Could not enqueue corpus ingestion for {raw_name}")

    logger.info("Enqueued %s into corpus %s as job_id=%s", raw_name, corpus_id, job_id)
    return {"job_id": job_id, "status": "queued", "filename": raw_name}


@rag_router.get(
    "/jobs/{job_id}",
    summary="Poll the outcome of an enqueued ingest job",
    description=(
        "Returns the current status of a job created by /ingest or /corpus/ingest: 'queued' or "
        "'processing' while the ingest worker has not yet reached a terminal state, then "
        "'complete', 'duplicate' or 'failed'. `result` carries the same shape /ingest used to "
        "return synchronously once the job is no longer queued or processing."
    ),
)
async def get_ingest_job(job_id: str):
    services = _services()
    job = services.metadata.get_ingest_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="No such ingest job")

    response = {
        "job_id": job["job_id"],
        "status": job["status"],
        "filename": job["filename"],
        "document_id": job["document_id"],
        "error": job["error"],
    }
    if job["result"] is not None:
        response.update(job["result"])
    return response


# ─── Extraction and archival ─────────────────────────────────────────────────


@rag_router.post(
    "/documents/extract",
    summary="Extract text from a document",
    description=(
        "Runs Docling (with OCR fallback for scans/images) on a single uploaded document and "
        "returns the extracted markdown text. Does not chunk, embed, or store anything in the "
        "index, so it works whatever the state of the vector store."
    ),
)
async def extract_document_text(
    file: UploadFile = File(...),
    r2_key: str = Form(default="", description="Deprecated alias for storage_key"),
    storage_key: str = Form(default=""),
    content_type: str = Form(default="application/octet-stream"),
    ocr_mode: str = Form(default="auto"),
):
    if not file.filename or Path(file.filename).suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, TXT, MD, JPG, or PNG files are accepted")

    if ocr_mode not in ("auto", "force_ocr", "text_only"):
        raise HTTPException(status_code=400, detail="ocr_mode must be one of: auto, force_ocr, text_only")

    max_bytes = settings.MAX_PDF_SIZE_MB * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.MAX_PDF_SIZE_MB}MB")

    key = storage_key or r2_key
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", Path(file.filename).name)
    temp_path = os.path.join(settings.UPLOAD_DIR, f"{uuid.uuid4().hex}_{safe_name}")

    try:
        with open(temp_path, "wb") as handle:
            handle.write(content)

        try:
            from rag.app.ingest.loader import load_pages
        except ImportError:
            raise HTTPException(status_code=503, detail=_MISSING_DEPENDENCIES)

        pages = await run_in_threadpool(load_pages, temp_path, ocr_mode)
        text = "\n\n".join(pages)
        if not text or not text.strip():
            raise HTTPException(status_code=422, detail="Nothing extractable in this document")

        # `pages` is additive: callers that only read `text` are unaffected, and
        # contract review uses it to tag each block with the page it came from.
        result = {"success": True, "text": text, "pages": pages}

        # The caller can hand us the key it wants this file archived under.
        # Doing the write here rather than in Next is what puts uploaded PDFs
        # through Ghostscript -- that binary cannot run on Vercel.
        if key:
            result.update(await run_in_threadpool(_compress_and_store, temp_path, key, content_type))

        return result
    except HTTPException:
        raise
    except Exception:
        raise _opaque_error(500, "Extraction failed", f"Document extraction failed for {file.filename}")
    finally:
        _remove(temp_path)


@rag_router.post(
    "/documents/compress",
    summary="Compress and archive a document",
    description=(
        "Recompresses an uploaded PDF with Ghostscript and writes it under PRIVATE_ROOT at the "
        "supplied key, returning the SHA-256 of the stored bytes. Does not parse the document, "
        "so it costs no OCR time -- this is the path for files that are stored but never "
        "indexed (vault documents, attachments)."
    ),
)
async def compress_document(
    file: UploadFile = File(...),
    r2_key: str = Form(default="", description="Deprecated alias for storage_key"),
    storage_key: str = Form(default=""),
    content_type: str = Form(default="application/octet-stream"),
):
    if not file.filename or Path(file.filename).suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    key = storage_key or r2_key
    if not key:
        raise HTTPException(status_code=400, detail="storage_key is required")

    max_bytes = settings.MAX_PDF_SIZE_MB * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.MAX_PDF_SIZE_MB}MB")

    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", Path(file.filename).name)
    temp_path = os.path.join(settings.UPLOAD_DIR, f"{uuid.uuid4().hex}_{safe_name}")

    try:
        with open(temp_path, "wb") as handle:
            handle.write(content)
        result = await run_in_threadpool(_compress_and_store, temp_path, key, content_type)
        return {"success": True, **result}
    except Exception:
        raise _opaque_error(500, "Storage failed", f"Compress-and-store failed for {file.filename}")
    finally:
        _remove(temp_path)


def _compress_and_store(temp_path: str, key: str, content_type: str) -> dict:
    """Recompress a PDF and write it under PRIVATE_ROOT. Never fatal.

    A storage failure must not lose the extracted text the caller is waiting on,
    so anything going wrong here is logged and reported as stored=False -- the
    caller then falls back to storing the original itself.
    """
    from rag.app.ingest.compress import compress_pdf

    services = _services()
    stored_path, stats = compress_pdf(temp_path, services.config)
    try:
        with open(stored_path, "rb") as handle:
            stored_sha256 = hashlib.sha256(handle.read()).hexdigest()
        services.documents.store_at_key(stored_path, key)
    except Exception:
        logger.exception("Failed to archive %s", key)
        return {"stored": False}
    finally:
        if stats["compressed"] and stored_path != temp_path:
            _remove(stored_path)

    return {
        "stored": True,
        # `r2_key` is the field name the Next app has always read. Kept as an
        # alias of `storage_key` so removing R2 is not a wire change.
        "r2_key": key,
        "storage_key": key,
        "sha256": stored_sha256,
        "original_bytes": stats["original_bytes"],
        "stored_bytes": stats["stored_bytes"],
        "compressed": stats["compressed"],
    }


@rag_router.get(
    "/documents/{document_id}/file",
    summary="Stream an archived corpus document",
    description=(
        "Serves the source PDF for an ingested document straight off the mounted volume. "
        "Replaces the presigned R2 URL the viewer route used to redirect to; access control "
        "still lives in the Next app, which mints a per-user, expiring token before calling "
        "this internal-only route."
    ),
)
async def get_document_file(document_id: str):
    services = _services()

    def _resolve():
        record = services.metadata.get_document(document_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Document not found")
        if not record.file_path:
            raise HTTPException(status_code=404, detail="No archived file for this document")
        try:
            return record, services.documents.resolve(record.file_path)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Archived file is missing from the volume")
        except ValueError:
            logger.error("Refusing to serve out-of-root path for %s", document_id)
            raise HTTPException(status_code=404, detail="Document not found")

    record, path = await run_in_threadpool(_resolve)
    filename = f"{record.title or document_id}{path.suffix}".replace("/", "-")
    return FileResponse(
        path,
        media_type="application/pdf" if path.suffix.lower() == ".pdf" else "application/octet-stream",
        filename=filename,
    )


# ─── Private object store (replaces the R2 private bucket) ───────────────────
#
# The Next app addresses these by an opaque, caller-derived key, exactly as it
# addressed R2 objects -- so removing the bucket is not a change to any of its
# call sites. Access control is unchanged too: it stays in the Next routes, which
# already authenticate the user and check that the key belongs to them, and this
# router is reachable only with the internal token.


@rag_router.put(
    "/objects/{key:path}",
    summary="Store a private object verbatim",
    description=(
        "Writes the uploaded bytes under PRIVATE_ROOT at the given key, unchanged, and "
        "returns their SHA-256. Distinct from /documents/compress, which recompresses "
        "first: callers that have already optimised a file need the bytes they sent to be "
        "the bytes that are stored, because that is what their recorded hash describes."
    ),
)
async def put_private_object(key: str, file: UploadFile = File(...)):
    services = _services()

    max_bytes = settings.MAX_PDF_SIZE_MB * 1024 * 1024
    temp_path = os.path.join(settings.UPLOAD_DIR, f"{uuid.uuid4().hex}.object")
    digest = hashlib.sha256()
    written = 0

    try:
        with open(temp_path, "wb") as handle:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(
                        status_code=413, detail=f"File exceeds {settings.MAX_PDF_SIZE_MB}MB"
                    )
                digest.update(chunk)
                handle.write(chunk)

        if not written:
            raise HTTPException(status_code=400, detail="Empty upload")

        def _store():
            try:
                return services.documents.store_at_key(temp_path, key)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))

        await run_in_threadpool(_store)
    except HTTPException:
        raise
    except Exception:
        raise _opaque_error(500, "Storage failed", "Failed to store object")
    finally:
        _remove(temp_path)

    return {"success": True, "key": key, "sha256": digest.hexdigest(), "size": written}


@rag_router.get(
    "/objects/{key:path}",
    summary="Stream a stored private object",
    description=(
        "Serves an object written by /documents/compress straight off the mounted volume. "
        "Replaces the presigned R2 GET the Next app used to issue."
    ),
)
async def get_private_object(key: str):
    services = _services()

    def _resolve():
        try:
            return services.documents.resolve_key(key)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Object not found")
        except ValueError:
            logger.error("Refusing out-of-root object key")
            raise HTTPException(status_code=404, detail="Object not found")

    path = await run_in_threadpool(_resolve)
    return FileResponse(
        path,
        media_type=_guess_media_type(path),
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


@rag_router.head(
    "/objects/{key:path}",
    summary="Check a stored private object",
    description="Size and existence without transferring the body -- the HEAD the vault's "
    "quick integrity check used to send to R2.",
)
async def head_private_object(key: str):
    services = _services()
    stat = await run_in_threadpool(services.documents.stat_key, key)
    if stat is None:
        raise HTTPException(status_code=404, detail="Object not found")
    from fastapi import Response

    return Response(
        status_code=200,
        headers={
            "Content-Length": str(stat["size"]),
            "Cache-Control": "private, no-store",
        },
    )


@rag_router.delete(
    "/objects/{key:path}",
    summary="Delete a stored private object",
)
async def delete_private_object(key: str):
    services = _services()

    def _delete():
        try:
            return services.documents.delete_key(key)
        except ValueError:
            logger.error("Refusing to delete an out-of-root object key")
            raise HTTPException(status_code=400, detail="Invalid key")

    deleted = await run_in_threadpool(_delete)
    # 404 is not an error for a delete: the caller wanted the object gone, and it
    # is. Reporting failure would make the Next app's cleanup path noisy for the
    # one outcome it is happy with.
    return {"success": True, "deleted": deleted}


_MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


def _guess_media_type(path: Path) -> str:
    """From the stored extension only -- never from a client-supplied name."""
    return _MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")


def _remove(path: str) -> None:
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except OSError:
        logger.warning("Could not remove temp file %s", path)
