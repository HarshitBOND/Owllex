"""Document delivery: private user documents, and the public legal corpus.

Two routers, deliberately separate, because they answer two different questions:

``/api/user-documents``
    Owner-scoped. Every request is authenticated with a Clerk JWT, and the only
    row a query here can return is one whose ``owner_id`` matches the verified
    ``sub`` of that token. Uploads land on the mounted volume under
    ``USERS_ROOT``; downloads stream straight back off it.

``/api/documents``
    The public legal corpus -- judgments, orders, bare acts. Still requires an
    authenticated caller (or the internal token the Next app presents), but not
    ownership, because there is no owner.

Neither router ever returns a filesystem path. The API's vocabulary is document
ids; ``storage_path`` exists only inside the backend, and a client that could
see it would be a client that could start guessing at the shape of the volume.

**Why the streaming goes through FileResponse.** Starlette's FileResponse serves
from an open file descriptor with sendfile where the platform allows it, handles
``Range`` and ``If-Range`` natively, and answers with 206 and a ``Content-Range``
rather than the whole document. That is what makes a browser's PDF viewer able to
open page 400 of a 200 MB brief without pulling the first 399, and it is why the
handlers below never read a document into memory.
"""

from __future__ import annotations

import hmac
import logging
import os
import tempfile
import threading
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse

from .config import settings
from .security import require_authenticated_user

logger = logging.getLogger("ravenslaw.documents")

user_documents_router = APIRouter(prefix="/api/user-documents", tags=["User Documents"])
public_documents_router = APIRouter(prefix="/api/documents", tags=["Documents"])

_MISSING_DEPENDENCIES = (
    "RAG dependencies are not installed on this instance (run: uv sync --extra rag)"
)

# Read in 1 MB blocks while spooling an upload to disk. Large enough that a 50 MB
# document is ~50 reads, small enough that a hundred concurrent uploads do not
# add up to a memory problem -- the point of spooling is that the whole file is
# never resident.
_SPOOL_CHUNK_BYTES = 1024 * 1024


# Per-owner upload throttle. The per-IP limiter in app/main.py is the baseline,
# but it is the wrong unit here: one authenticated account behind a corporate NAT
# shares an IP with everybody else there, and an account script-uploading through
# a pool of addresses evades it entirely. Uploads are the expensive request on
# this service -- each one spools to disk, sniffs, hashes and fsyncs -- so they
# get their own bucket keyed on the identity that actually pays for the work.
_UPLOAD_MAX_PER_WINDOW = 60
_UPLOAD_WINDOW_SECONDS = 600
_upload_buckets: dict[str, deque] = defaultdict(deque)
_upload_lock = threading.Lock()


def _throttle_uploads(owner_id: str) -> None:
    now = time.monotonic()
    with _upload_lock:
        bucket = _upload_buckets[owner_id]
        while bucket and bucket[0] < now - _UPLOAD_WINDOW_SECONDS:
            bucket.popleft()
        if len(bucket) >= _UPLOAD_MAX_PER_WINDOW:
            retry_after = int(_UPLOAD_WINDOW_SECONDS - (now - bucket[0])) + 1
            raise HTTPException(
                status_code=429,
                detail="Too many uploads. Try again shortly.",
                headers={"Retry-After": str(retry_after)},
            )
        bucket.append(now)
        # Buckets are only ever appended to, so an instance that has seen a lot
        # of accounts would otherwise hold one deque per owner forever.
        if len(_upload_buckets) > 10_000:
            for key in [k for k, v in _upload_buckets.items() if not v]:
                del _upload_buckets[key]


def _services():
    """The started RAG container, or a 503 naming what is missing."""
    try:
        from rag.core.services import get_services
    except ImportError as exc:
        logger.error("RAG stack unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=_MISSING_DEPENDENCIES) from exc
    try:
        return get_services()
    except Exception as exc:
        logger.exception("RAG stack failed to start")
        raise HTTPException(status_code=503, detail=f"Storage backend unavailable: {exc}") from exc


def _errors():
    """Storage exception types, imported lazily alongside the stack."""
    from rag.core.user_document_store import QuotaExceeded
    from rag.core.user_paths import UnsafePathError

    return UnsafePathError, QuotaExceeded


# ─── Response shaping ────────────────────────────────────────────────────────


def _document_payload(record) -> dict[str, Any]:
    """The public view of a document row.

    ``storage_path`` is conspicuously absent, and must stay absent. It is the one
    field that would tell a client where the volume keeps its files, and every
    route that needs it resolves it server-side from the id.
    """
    return {
        "document_id": record.document_id,
        "filename": record.original_filename,
        "category": record.category,
        "mime_type": record.mime_type,
        "file_size": record.file_size,
        "sha256": record.content_hash,
        "created_at": record.created_at,
    }


def _content_disposition(filename: str | None, fallback: str) -> str:
    """A Content-Disposition header that cannot be broken by a filename.

    RFC 6266: a quoted ASCII ``filename`` for old clients plus a percent-encoded
    ``filename*`` carrying the real name. The ASCII form is stripped to a
    conservative character class rather than escaped, because a stray quote or
    newline in that parameter is a response-splitting bug, not a cosmetic one.
    """
    from urllib.parse import quote

    from rag.core.user_paths import sanitize_filename

    safe = sanitize_filename(filename, fallback=fallback)
    ascii_name = "".join(ch if 32 <= ord(ch) < 127 and ch not in '"\\' else "_" for ch in safe)
    return f'inline; filename="{ascii_name}"; filename*=UTF-8\'\'{quote(safe, safe="")}'


def _stream(path: Path, *, filename: str | None, mime_type: str | None, fallback: str) -> FileResponse:
    """Serve a file off the volume with range support and no caching.

    ``no-store`` because these are legal documents behind an ownership check:
    a shared proxy or an intermediary CDN holding a copy would undo the check
    entirely, and the browser's own disk cache is a smaller version of the same
    problem on a shared machine.
    """
    return FileResponse(
        path,
        media_type=mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": _content_disposition(filename, fallback),
            "Cache-Control": "private, no-store, max-age=0",
            "X-Content-Type-Options": "nosniff",
            # A PDF served inline is rendered by the browser; the CSP stops a
            # crafted document from being a vector for anything else.
            "Content-Security-Policy": "default-src 'none'; object-src 'self'; plugin-types application/pdf",
            "Accept-Ranges": "bytes",
        },
    )


# ─── Private user documents ──────────────────────────────────────────────────


@user_documents_router.post(
    "",
    status_code=201,
    summary="Upload a private document",
    description=(
        "Stores a PDF or DOCX on the mounted volume under the authenticated user's own "
        "directory and records its metadata. The response carries the document id the "
        "download route takes; it never carries a filesystem path."
    ),
)
async def upload_user_document(
    request: Request,
    file: UploadFile = File(...),
    category: str = Form(default="miscellaneous"),
    owner_id: str = Depends(require_authenticated_user),
):
    _throttle_uploads(owner_id)
    services = _services()
    UnsafePathError, QuotaExceeded = _errors()

    from rag.core.user_paths import new_document_id, normalise_category, sanitize_filename

    try:
        normalised_category = normalise_category(category)
    except UnsafePathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    max_bytes = _max_upload_bytes(services)
    # Refuse on the declared length before reading a byte, so an oversized upload
    # costs one round trip rather than a full transfer to /dev/null.
    declared = _declared_length(request)
    if declared is not None and declared > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {max_bytes // (1024 * 1024)}MB limit",
        )

    document_id = new_document_id()
    temp_path = await _spool_upload(file, max_bytes)

    try:
        def _persist():
            size = os.path.getsize(temp_path)
            # Checked against what is already on disk for this owner, before the
            # file is moved into place -- a rejected upload must not occupy the
            # volume even briefly.
            services.user_documents.enforce_quota(owner_id, size)
            stored = services.user_documents.store(
                temp_path,
                document_id=document_id,
                owner_id=owner_id,
                category=normalised_category,
                declared_content_type=file.content_type,
            )
            try:
                return services.metadata.insert_user_document(
                    document_id=stored.document_id,
                    owner_id=owner_id,
                    category=stored.category,
                    storage_path=stored.storage_path,
                    original_filename=sanitize_filename(file.filename),
                    mime_type=stored.mime_type,
                    file_size=stored.file_size,
                    content_hash=stored.sha256,
                    title=sanitize_filename(file.filename),
                )
            except Exception:
                # The row is what makes the file reachable. Without it the bytes
                # are unreferenced and invisible, so they come back off the
                # volume rather than accumulating as orphans nobody can find.
                services.user_documents.delete(stored.storage_path, owner_id=owner_id)
                raise

        record = await run_in_threadpool(_persist)
    except QuotaExceeded as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except UnsafePathError as exc:
        # Sniffing rejected the content, or a path component was unusable. Both
        # are the caller's problem and neither should leak what we looked at.
        logger.info("Rejected upload from %s: %s", owner_id, exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileExistsError as exc:
        logger.error("Document id collision for %s: %s", owner_id, exc)
        raise HTTPException(status_code=500, detail="Could not store the document") from exc
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to store an upload for %s", owner_id)
        raise HTTPException(status_code=500, detail="Could not store the document")
    finally:
        _remove(temp_path)

    return _document_payload(record)


@user_documents_router.get(
    "",
    summary="List the caller's private documents",
)
async def list_user_documents(
    category: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    owner_id: str = Depends(require_authenticated_user),
):
    services = _services()
    UnsafePathError, _ = _errors()

    from rag.core.user_paths import normalise_category

    normalised = None
    if category:
        try:
            normalised = normalise_category(category)
        except UnsafePathError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    def _read():
        rows = services.metadata.list_user_documents(
            owner_id, category=normalised, limit=limit, offset=offset
        )
        return rows, services.metadata.user_document_usage(owner_id)

    records, usage = await run_in_threadpool(_read)
    return {
        "documents": [_document_payload(r) for r in records],
        "usage": usage,
    }


@user_documents_router.get(
    "/{document_id}",
    summary="Download a private document",
    description=(
        "Streams the document off the mounted volume, honouring Range requests so a "
        "browser's PDF viewer can seek. Returns 403 unless the authenticated caller owns it."
    ),
)
async def get_user_document(
    document_id: str,
    owner_id: str = Depends(require_authenticated_user),
):
    services = _services()
    UnsafePathError, _ = _errors()

    from rag.core.user_paths import is_document_id

    # Rejected before it can reach a query or a path join. Nothing legitimate
    # produces an id of another shape.
    if not is_document_id(document_id):
        raise HTTPException(status_code=403, detail="Forbidden")

    def _resolve():
        record = services.metadata.get_owned_document(document_id, owner_id)
        if record is None:
            # 403 for both "someone else's" and "does not exist". Distinguishing
            # them would turn this route into an oracle for which document ids
            # are real, which is worth more to an attacker than the accuracy is
            # to a client that can only ever ask about its own documents anyway.
            raise HTTPException(status_code=403, detail="Forbidden")

        # Belt and braces over the SQL predicate that already selected on owner.
        if not hmac.compare_digest(str(record.owner_id or ""), owner_id):
            logger.error(
                "Ownership mismatch after an owner-scoped query for %s", document_id
            )
            raise HTTPException(status_code=403, detail="Forbidden")

        try:
            # The store re-derives the owner segment from owner_id and refuses a
            # storage_path that does not sit under it, so a row whose columns
            # disagree fails closed instead of serving the wrong file.
            path = services.user_documents.resolve(record.storage_path, owner_id=owner_id)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Document is missing from storage")
        except UnsafePathError:
            logger.error("Refusing out-of-root storage_path for %s", document_id)
            raise HTTPException(status_code=403, detail="Forbidden")
        return record, path

    record, path = await run_in_threadpool(_resolve)
    return _stream(
        path,
        filename=record.original_filename,
        mime_type=record.mime_type,
        fallback=f"{document_id}{path.suffix}",
    )


@user_documents_router.delete(
    "/{document_id}",
    summary="Delete a private document",
)
async def delete_user_document(
    document_id: str,
    owner_id: str = Depends(require_authenticated_user),
):
    services = _services()

    from rag.core.user_paths import is_document_id

    if not is_document_id(document_id):
        raise HTTPException(status_code=403, detail="Forbidden")

    def _delete():
        record = services.metadata.delete_user_document(document_id, owner_id)
        if record is None:
            raise HTTPException(status_code=403, detail="Forbidden")
        # Row first, then the file: an orphaned file is a housekeeping job, while
        # a row pointing at a deleted file is a 404 the user cannot clear.
        services.user_documents.delete(record.storage_path, owner_id=owner_id)
        return record

    await run_in_threadpool(_delete)
    return {"document_id": document_id, "deleted": True}


# ─── Public legal corpus ─────────────────────────────────────────────────────


async def _require_reader(
    authorization: str | None = Header(default=None),
    x_internal_token: str | None = Header(default=None),
) -> str:
    """Any authenticated caller: a signed-in user, or the Next app itself.

    The corpus is public *to the product*, not to the internet. Requiring one of
    the two credentials keeps it off the open web while leaving the Next app's
    existing server-to-server path -- which has no end-user token to forward when
    it renders a citation -- working unchanged.
    """
    expected = settings.INTERNAL_TOKEN.strip()
    received = (x_internal_token or "").strip()
    if expected and received and hmac.compare_digest(received, expected):
        return "internal"
    return await require_authenticated_user(authorization)


@public_documents_router.get(
    "/{document_id}",
    summary="Stream a public legal-corpus document",
    description=(
        "Serves a judgment, order or bare act off the mounted volume. Only documents that "
        "are part of the public corpus are reachable here -- a private user document, or a "
        "document belonging to somebody's own research corpus, is not."
    ),
)
async def get_public_document(
    document_id: str,
    _reader: str = Depends(_require_reader),
):
    services = _services()

    def _resolve():
        record = services.metadata.get_public_corpus_document(document_id)
        if record is None:
            # Includes the case where the id names a private document. Reporting
            # 403 there would confirm it exists.
            raise HTTPException(status_code=404, detail="Document not found")
        if not record.file_path:
            raise HTTPException(status_code=404, detail="No archived file for this document")
        try:
            return record, services.documents.resolve(record.file_path)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Archived file is missing from the volume")
        except ValueError:
            logger.error("Refusing out-of-root corpus path for %s", document_id)
            raise HTTPException(status_code=404, detail="Document not found")

    record, path = await run_in_threadpool(_resolve)
    return _stream(
        path,
        filename=f"{record.title or document_id}{path.suffix}",
        mime_type=record.mime_type or _mime_for(path),
        fallback=f"{document_id}{path.suffix}",
    )


# ─── Upload plumbing ─────────────────────────────────────────────────────────


def _max_upload_bytes(services) -> int:
    return services.config.max_user_document_mb * 1024 * 1024


def _declared_length(request: Request) -> int | None:
    raw = request.headers.get("content-length")
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


async def _spool_upload(file: UploadFile, max_bytes: int) -> str:
    """Write an upload to a temp file in chunks, aborting past ``max_bytes``.

    Never ``await file.read()`` without a length: that materialises the whole
    document in memory, and with a 50 MB ceiling and a handful of concurrent
    uploaders it is the fastest way to OOM the box. The running total is checked
    as it is written, so a client that lies about (or omits) Content-Length is
    stopped at the limit rather than after it.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    fd, temp_path = tempfile.mkstemp(dir=settings.UPLOAD_DIR, suffix=".upload")
    os.close(fd)
    os.chmod(temp_path, 0o600)

    written = 0
    try:
        with open(temp_path, "wb") as handle:
            while True:
                chunk = await file.read(_SPOOL_CHUNK_BYTES)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds the {max_bytes // (1024 * 1024)}MB limit",
                    )
                handle.write(chunk)
        if written == 0:
            raise HTTPException(status_code=400, detail="The uploaded file is empty")
    except BaseException:
        _remove(temp_path)
        raise
    return temp_path


def _mime_for(path: Path) -> str:
    return "application/pdf" if path.suffix.lower() == ".pdf" else "application/octet-stream"


def _remove(path: str | None) -> None:
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except OSError:
        logger.warning("Could not remove temp file %s", path)
