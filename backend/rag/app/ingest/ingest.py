"""Module-level entry point for ingestion.

Thin wrapper over :class:`rag.app.ingest.pipeline.IngestionPipeline`, holding the
call signature the HTTP layer and the scraper have always used while the
pipeline itself takes its dependencies explicitly. Application code that can
pass a container should construct the pipeline directly.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Sequence

from rag.core.services import get_services
from rag.core.vector_index import PUBLIC_COLLECTION

from .pipeline import IngestionPipeline

# Re-exported so callers keep importing collection names from one place.
COLLECTION = PUBLIC_COLLECTION


def ingest_document(
    paths: str | Path | Sequence[str | Path],
    document_id: str,
    collection: str = PUBLIC_COLLECTION,
    extra_metadata: dict[str, Any] | None = None,
    dedupe_scope: str = "",
    persist_source: bool = True,
    court_hint: str | None = None,
) -> dict[str, Any]:
    """Ingest one document and return the flat result the API responds with."""
    pipeline = IngestionPipeline(get_services())
    return pipeline.ingest(
        paths,
        document_id=document_id,
        collection=collection,
        extra_metadata=extra_metadata,
        dedupe_scope=dedupe_scope,
        persist_source=persist_source,
        court_hint=court_hint,
    ).to_dict()
