from .loader import load_pdf
from .metadata import extract_metadata
from .splitter import semantic_chunk
from .vector_db import store_chunks


def ingest_document(pdf_path, document_id):
    text = load_pdf(pdf_path).export_to_markdown()
    chunks = semantic_chunk(text)
    metadata = extract_metadata(text[:3000])
    store_chunks(document_id, chunks, metadata.model_dump())
