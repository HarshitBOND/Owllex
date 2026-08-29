import hashlib
from pathlib import Path

from rag import hash_db

from .loader import load_text
from .metadata import extract_metadata
from .splitter import semantic_chunk
from .storage import upload_source_document
from .vector_db import store_chunks


def ingest_document(path, document_id):
    content_hash = hashlib.sha256(Path(path).read_bytes()).hexdigest()
    if hash_db.exists(content_hash):
        return {
            "skipped": True,
            "reason": "duplicate",
            "content_hash": content_hash,
            "existing_document_id": hash_db.get(content_hash),
        }

    text = load_text(path)
    if not text.strip():
        raise ValueError("No text could be extracted from this document (it may be a scan with no text layer)")

    chunks = semantic_chunk(text)
    if not chunks:
        raise ValueError("Document produced no chunks")

    storage = upload_source_document(path, content_hash, "upload", Path(path).suffix)

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
