import hashlib
import os
import tempfile
import zipfile
from pathlib import Path

from rag import hash_db

from .compress import compress_pdf
from .loader import load_text
from .metadata import extract_metadata
from .splitter import semantic_chunk
from .storage import upload_source_document
from .vector_db import COLLECTION, store_chunks


def ingest_document(paths, document_id, collection=COLLECTION, extra_metadata=None, dedupe_scope="", persist_source=True):
    """Ingest one document, given either a single path or an ordered list of paths.

    A list of more than one path is treated as ordered pages of one physical
    document (e.g. a photo per page) -- their bytes are hashed together, their
    extracted text is concatenated in order, and they land as a single
    document_id/chunk set, exactly like a single-file PDF/DOCX upload.

    dedupe_scope namespaces the content hash. The admin corpus passes nothing, so its
    hashes stay global and unchanged. Per-user corpora pass their corpus_id, so the same
    file uploaded by two advocates indexes into both instead of the second being skipped.

    persist_source controls whether the raw file is copied into the public, content-addressed
    R2 store. Only the admin/public corpus should set this -- private per-user corpus documents
    are already stored privately (with access control) by the caller, and must never also land
    in the public bucket.
    """
    if isinstance(paths, (str, Path)):
        paths = [paths]
    paths = [Path(p) for p in paths]

    content_hash = hashlib.sha256(
        dedupe_scope.encode() + b"".join(p.read_bytes() for p in paths)
    ).hexdigest()
    if hash_db.exists(content_hash):
        return {
            "skipped": True,
            "reason": "duplicate",
            "content_hash": content_hash,
            "existing_document_id": hash_db.get(content_hash),
        }

    page_texts = [load_text(p) for p in paths]
    text = "\n\n".join(f"<!-- page {i + 1} -->\n\n{page_text}" for i, page_text in enumerate(page_texts))
    if not text.strip():
        raise ValueError("No text could be extracted from this document (it may be a scan with no text layer)")

    chunks = semantic_chunk(text)
    if not chunks:
        raise ValueError("Document produced no chunks")

    storage = (
        _upload_source(paths, content_hash)
        if persist_source
        else {"key": None, "url": None, "original_bytes": 0, "stored_bytes": 0}
    )

    metadata = extract_metadata(text[:3000])
    metadata_dict = {
        **metadata.model_dump(),
        "storage_ref": storage["key"] or "",
        "source_url": storage["url"] or "",
        **(extra_metadata or {}),
    }
    store_chunks(document_id, chunks, metadata_dict, collection)

    hash_db.put(content_hash, document_id)
    hash_db.backup_to_r2()

    return {"skipped": False, "chunk_count": len(chunks), "content_hash": content_hash, **metadata_dict}


def _upload_source(paths: list[Path], content_hash: str) -> dict:
    """Archive the source in R2, recompressing PDFs on the way in.

    Note the key still carries the hash of the *original* bytes. That hash is
    the document's identity -- it is the LMDB dedup key and it is baked into
    every citation link -- while the stored object is a derived artifact. Hashing
    the compressed output instead would re-ingest every document once and orphan
    the links that point at the old keys.
    """
    if len(paths) == 1:
        src = paths[0]
        stored_path, stats = compress_pdf(src)
        try:
            result = upload_source_document(stored_path, content_hash, "upload", src.suffix)
        finally:
            if stats["compressed"] and stored_path != str(src):
                try:
                    os.remove(stored_path)
                except OSError:
                    pass
        return {**result, **stats}

    # Multi-page group: zip the ordered pages into one archive so the rest of the
    # schema's one-storage_ref-per-document contract (source citation) still holds.
    fd, zip_path = tempfile.mkstemp(suffix=".zip")
    os.close(fd)
    try:
        original_bytes = sum(p.stat().st_size for p in paths)
        with zipfile.ZipFile(zip_path, "w") as zf:
            for i, p in enumerate(paths):
                page_path, page_stats = compress_pdf(p)
                try:
                    zf.write(page_path, arcname=f"page_{i:03d}{p.suffix}")
                finally:
                    if page_stats["compressed"] and page_path != str(p):
                        try:
                            os.remove(page_path)
                        except OSError:
                            pass
        stored_bytes = os.path.getsize(zip_path)
        result = upload_source_document(zip_path, content_hash, "upload", ".zip")
        return {
            **result,
            "original_bytes": original_bytes,
            "stored_bytes": stored_bytes,
            "compressed": stored_bytes < original_bytes,
        }
    finally:
        os.remove(zip_path)
