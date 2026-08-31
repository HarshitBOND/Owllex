import hashlib
import os
import tempfile
import zipfile
from pathlib import Path

from rag import hash_db

from .loader import load_text
from .metadata import extract_metadata
from .splitter import semantic_chunk
from .storage import upload_source_document
from .vector_db import store_chunks


def ingest_document(paths, document_id):
    """Ingest one document, given either a single path or an ordered list of paths.

    A list of more than one path is treated as ordered pages of one physical
    document (e.g. a photo per page) -- their bytes are hashed together, their
    extracted text is concatenated in order, and they land as a single
    document_id/chunk set, exactly like a single-file PDF/DOCX upload.
    """
    if isinstance(paths, (str, Path)):
        paths = [paths]
    paths = [Path(p) for p in paths]

    content_hash = hashlib.sha256(b"".join(p.read_bytes() for p in paths)).hexdigest()
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

    storage = _upload_source(paths, content_hash)

    metadata = extract_metadata(text[:3000])
    metadata_dict = {
        **metadata.model_dump(),
        "storage_ref": storage["key"] or "",
        "source_url": storage["url"] or "",
    }
    store_chunks(document_id, chunks, metadata_dict)

    hash_db.put(content_hash, document_id)
    hash_db.backup_to_r2()

    return {"skipped": False, "chunk_count": len(chunks), "content_hash": content_hash, **metadata_dict}


def _upload_source(paths: list[Path], content_hash: str) -> dict:
    if len(paths) == 1:
        return upload_source_document(str(paths[0]), content_hash, "upload", paths[0].suffix)

    # Multi-page group: zip the ordered pages into one archive so the rest of the
    # schema's one-storage_ref-per-document contract (source citation) still holds.
    fd, zip_path = tempfile.mkstemp(suffix=".zip")
    os.close(fd)
    try:
        with zipfile.ZipFile(zip_path, "w") as zf:
            for i, p in enumerate(paths):
                zf.write(p, arcname=f"page_{i:03d}{p.suffix}")
        return upload_source_document(zip_path, content_hash, "upload", ".zip")
    finally:
        os.remove(zip_path)
