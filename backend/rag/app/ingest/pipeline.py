"""The ingestion pipeline: PDF in, searchable chunks out.

    read bytes -> SHA-256 -> LMDB check -> Docling parse -> chunk
      -> embed -> SQLite metadata -> FAISS vectors -> archive PDF -> LMDB commit

**Resumability** comes from the order of the last two steps, not from a separate
journal. The LMDB write is the commit point: it happens only after everything
else has succeeded, so a run killed at any earlier stage leaves the document
*absent* from the hash index and it is re-ingested on the next pass. What makes
that re-ingest safe rather than duplicative:

* the archive is content-addressed, so re-storing writes nothing new;
* ``replace_chunks`` deletes the previous attempt's chunk rows and hands back
  their embedding ids, which are then removed from FAISS before the new vectors
  go in -- so a retry replaces a partial document instead of stacking a second
  copy of it on top;
* embedding ids are never reused, so a vector that outlives its row can only
  fail to resolve, never resolve to the wrong chunk.

The document's ``status`` column tracks how far each attempt got, which is what
makes a stalled 50,000-document run diagnosable after the fact.
"""

from __future__ import annotations

import hashlib
import logging
import os
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

from rag.core.services import RagServices
from rag.core.sqlite_store import (
    STATUS_CHUNKED,
    STATUS_COMPLETE,
    STATUS_EMBEDDED,
    STATUS_FAILED,
    STATUS_INDEXED,
    STATUS_PARSED,
    STATUS_PENDING,
)
from rag.core.vector_index import PUBLIC_COLLECTION

from .loader import load_pages
from .metadata import extract_metadata
from .splitter import split_pages

logger = logging.getLogger("ravenslaw.rag.ingest")

_HASH_READ_SIZE = 1024 * 1024

LANE_DENSE = "dense"
LANE_LEXICAL = "lexical"

# Phrases that mark a document as substantive even when it's short and from an
# unidentified court -- see _route_lane, rule 3.
_DENSE_LANE_PHRASES = ("held", "coram", "reasoning", "it is ordered")


@dataclass(frozen=True)
class IngestResult:
    """Outcome of one ingest. Serialised straight into the API response."""

    document_id: str
    content_hash: str
    skipped: bool
    chunk_count: int
    page_count: int
    metadata: dict[str, Any]
    existing_document_id: str | None = None
    reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Flat shape the HTTP layer has always returned."""
        if self.skipped:
            return {
                "skipped": True,
                "reason": self.reason,
                "content_hash": self.content_hash,
                "existing_document_id": self.existing_document_id,
            }
        return {
            "skipped": False,
            "chunk_count": self.chunk_count,
            "page_count": self.page_count,
            "content_hash": self.content_hash,
            **self.metadata,
        }


class IngestionPipeline:
    """Ingests documents into one of the FAISS-backed collections.

    Takes its dependencies as a container rather than importing module state, so
    it can be pointed at a temp DATA_ROOT and a stub embedder in tests.
    """

    def __init__(self, services: RagServices) -> None:
        self._services = services

    # ─── Public API ──────────────────────────────────────────────────────────

    def ingest(
        self,
        paths: str | Path | Sequence[str | Path],
        document_id: str,
        collection: str = PUBLIC_COLLECTION,
        extra_metadata: dict[str, Any] | None = None,
        dedupe_scope: str = "",
        persist_source: bool = True,
        court_hint: str | None = None,
    ) -> IngestResult:
        """Ingest one document, given a single path or its ordered pages.

        A list of more than one path is treated as ordered pages of one physical
        document (e.g. a photo per page): their bytes are hashed together, their
        text is concatenated in order, and they land as a single document.

        ``dedupe_scope`` namespaces the content hash. The admin corpus passes
        nothing, so its hashes stay global. Per-user corpora pass their
        corpus_id, so the same file uploaded by two advocates indexes into both
        instead of the second being skipped as a duplicate of the first.

        ``persist_source`` controls whether the raw file is archived under
        ``PDF_ROOT``. Only the public corpus sets it: per-user documents are
        already stored, with access control, by the caller.
        """
        resolved = _as_paths(paths)
        content_hash = self._hash(resolved, dedupe_scope)

        existing = self._services.hashes.get(content_hash)
        if existing is not None:
            logger.info("Skipping %s: already ingested as %s", resolved[0].name, existing.document_id)
            return IngestResult(
                document_id=document_id,
                content_hash=content_hash,
                skipped=True,
                chunk_count=0,
                page_count=0,
                metadata={},
                existing_document_id=existing.document_id,
                reason="duplicate",
            )

        try:
            return self._run(
                resolved,
                document_id=document_id,
                collection=collection,
                content_hash=content_hash,
                extra_metadata=extra_metadata or {},
                persist_source=persist_source,
                court_hint=court_hint,
            )
        except Exception as exc:
            # The row is left behind on purpose: a failed document is
            # inspectable, and its status is what a resume run selects on.
            self._services.metadata.set_status(document_id, STATUS_FAILED, str(exc))
            raise

    # ─── Stages ──────────────────────────────────────────────────────────────

    def _run(
        self,
        paths: list[Path],
        *,
        document_id: str,
        collection: str,
        content_hash: str,
        extra_metadata: dict[str, Any],
        persist_source: bool,
        court_hint: str | None,
    ) -> IngestResult:
        services = self._services
        config = services.config

        # The document's owner, resolved once. `owner_id` is the name this
        # pipeline prefers; `clerk_uid` is what the per-advocate corpus path has
        # always passed. Both mean "this document is private to that person",
        # and they are collapsed here so the document row, the chunk rows and
        # the id partition cannot end up disagreeing about who owns it.
        owner_id = extra_metadata.get("owner_id") or extra_metadata.get("clerk_uid")

        services.metadata.upsert_document(
            document_id=document_id,
            collection=collection,
            content_hash=content_hash,
            corpus_id=extra_metadata.get("corpus_id"),
            clerk_uid=owner_id,
            status=STATUS_PENDING,
        )

        # 1. Parse. Pages from every input file, in order.
        pages: list[str] = []
        for path in paths:
            pages.extend(load_pages(path))
        if not any(page.strip() for page in pages):
            raise ValueError(
                "No text could be extracted from this document "
                "(it may be a scan with no text layer)"
            )
        services.metadata.set_status(document_id, STATUS_PARSED)

        # 2. Chunk, carrying page numbers through.
        chunks = split_pages(pages, config.chunk_size, config.chunk_overlap)
        if not chunks:
            raise ValueError("Document produced no chunks")
        services.metadata.set_status(document_id, STATUS_CHUNKED)

        # 3. Identify. Deterministic parse of the front matter; no model call.
        document_text = "\n\n".join(pages)
        metadata = extract_metadata(document_text, paths[0].name, court_hint)

        # 3b. Route. Only the public legal corpus is split into lanes -- T14's
        # cost argument is entirely about that corpus's growth to 10 crore
        # documents. A private/per-advocate document (collection ==
        # USER_COLLECTION) is whatever the owner chose to upload -- a lease, a
        # merger agreement -- and has semantic-search value regardless of its
        # length or a "court" field that rarely even applies to it, so it stays
        # dense exactly as before this task. Must run before step 5, since not
        # embedding the lexical lane is most of the cost saving.
        if collection == PUBLIC_COLLECTION:
            lane, lane_reason = _route_lane(metadata.court, len(pages), document_text, config)
        else:
            lane, lane_reason = LANE_DENSE, "collection:private"

        # 4. Archive the source on the mounted volume.
        file_path = self._archive(paths, content_hash, metadata, court_hint) if persist_source else None

        services.metadata.upsert_document(
            document_id=document_id,
            collection=collection,
            court=metadata.court or None,
            citation=metadata.citation or None,
            title=metadata.title,
            file_path=file_path,
            content_hash=content_hash,
            document_type=metadata.document_type,
            doc_date=metadata.date or None,
            lane=lane,
            lane_reason=lane_reason,
            storage_ref=file_path,
            source_url=_public_url(file_path),
            corpus_id=extra_metadata.get("corpus_id"),
            clerk_uid=owner_id,
            page_count=len(pages),
            status=STATUS_CHUNKED,
        )

        # 5. Embed locally, in batches -- skipped for the lexical lane, which
        # is the point of routing: those chunks are still searchable through
        # chunks_fts (step 6 writes them there regardless of lane), just never
        # through the dense index.
        vectors = (
            services.embedder.embed_documents([chunk.text for chunk in chunks])
            if lane == LANE_DENSE
            else None
        )
        services.metadata.set_status(document_id, STATUS_EMBEDDED)

        # 6. Write chunk rows, then vectors. Any ids left by a previous attempt
        #    come back here and are dropped from FAISS before the new ones land,
        #    so a retried or re-ingested document replaces its vectors rather
        #    than stacking a second copy on top of them.
        #
        #    Which partition the ids come from is decided by ownership, not by
        #    the caller: a private document's vectors must be unreachable from
        #    the public range, and that is enforced here and again by a trigger.
        #    Every chunk gets a faiss_id regardless of lane -- the column is
        #    NOT NULL UNIQUE -- but a lexical-lane id is never added to the
        #    index below; rag/scripts/promote_lane.py can add it later under
        #    the same id without reallocating one.
        faiss_ids = list(
            services.metadata.allocate_faiss_ids(len(chunks), private=owner_id is not None)
        )
        stale_ids = services.metadata.replace_chunks(
            document_id,
            collection,
            [(chunk.text, chunk.page_number) for chunk in chunks],
            faiss_ids,
            owner_id=owner_id,
        )

        index = services.indexes.get(collection)
        if stale_ids:
            # Dropped regardless of this attempt's lane: a document that was
            # dense before and is lexical now must not leave its old vectors
            # behind in the index.
            removed = index.remove(stale_ids)
            logger.info("Replaced %d stale vector(s) for %s", removed, document_id)
        if lane == LANE_DENSE:
            index.add(faiss_ids, vectors)
        services.metadata.set_status(document_id, STATUS_INDEXED)

        # 7. Commit. Only now is the document considered ingested.
        services.hashes.put(
            content_hash,
            document_id=document_id,
            file_path=file_path,
            court=metadata.court or None,
        )
        services.metadata.set_status(document_id, STATUS_COMPLETE)

        logger.info(
            "Ingested %s as %s (%d pages, %d chunks, court=%s, lane=%s/%s)",
            paths[0].name, document_id, len(pages), len(chunks),
            metadata.court or "unknown", lane, lane_reason,
        )

        return IngestResult(
            document_id=document_id,
            content_hash=content_hash,
            skipped=False,
            chunk_count=len(chunks),
            page_count=len(pages),
            metadata={
                **metadata.model_dump(),
                "storage_ref": file_path or "",
                "source_url": _public_url(file_path) or "",
                **extra_metadata,
            },
        )

    # ─── Helpers ─────────────────────────────────────────────────────────────

    def _archive(self, paths, content_hash, metadata, court_hint) -> str:
        """Store the source under PDF_ROOT and return its relative path.

        A multi-page group is zipped into a single archive first: the schema
        holds one file_path per document, and a citation has to resolve to the
        whole physical document rather than to whichever page happened to be
        first.
        """
        store = self._services.documents
        if len(paths) == 1:
            return store.store(
                source=paths[0],
                content_hash=content_hash,
                court=metadata.court or court_hint,
                year=metadata.date,
                suffix=paths[0].suffix,
            ).relative_path

        handle, zip_path = tempfile.mkstemp(suffix=".zip")
        os.close(handle)
        try:
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
                for index, path in enumerate(paths):
                    archive.write(path, arcname=f"page_{index:03d}{path.suffix}")
            return store.store(
                source=zip_path,
                content_hash=content_hash,
                court=metadata.court or court_hint,
                year=metadata.date,
                suffix=".zip",
            ).relative_path
        finally:
            try:
                os.remove(zip_path)
            except OSError:
                pass

    @staticmethod
    def _hash(paths: list[Path], dedupe_scope: str) -> str:
        """SHA-256 over the scope prefix and every file's bytes, in order.

        Streamed rather than read whole: this runs before any size-bounded
        processing, and a bulk importer must not need the largest document in
        the corpus resident to decide it has seen it already.
        """
        digest = hashlib.sha256()
        digest.update(dedupe_scope.encode())
        for path in paths:
            with open(path, "rb") as handle:
                while block := handle.read(_HASH_READ_SIZE):
                    digest.update(block)
        return digest.hexdigest()


def _route_lane(court: str, page_count: int, document_text: str, config) -> tuple[str, str]:
    """Decide whether a document is worth embedding, and record why.

    Rules-based rather than a trained classifier, deliberately: a wrong call
    here is recoverable by ``rag/scripts/promote_lane.py`` without a training
    set, a versioning problem, or an explainability problem -- see
    PRODUCTION_TODO.md T14. First match wins, and court is checked before
    length on purpose: length only predicts value *within* a court, so a short
    Supreme Court order and a short district-court adjournment slip must not
    be routed by the same length cutoff.
    """
    if court == "sci" or court.startswith("hc/"):
        return LANE_DENSE, f"court:{court}"

    if page_count > config.dense_lane_min_pages:
        return LANE_DENSE, "pages"

    lowered = document_text.lower()
    for phrase in _DENSE_LANE_PHRASES:
        if phrase in lowered:
            return LANE_DENSE, f"phrase:{phrase}"

    if len(document_text) >= config.dense_lane_min_chars:
        return LANE_DENSE, "length"

    return LANE_LEXICAL, "default"


def _as_paths(paths: str | Path | Sequence[str | Path]) -> list[Path]:
    if isinstance(paths, (str, Path)):
        return [Path(paths)]
    resolved = [Path(p) for p in paths]
    if not resolved:
        raise ValueError("No input files given")
    return resolved


def _public_url(relative_path: str | None) -> str | None:
    """Public URL for an archived document, when one is configured.

    Empty by default: documents are served through the app's own token-checked
    viewer route, not from a public origin. ``PUBLIC_DOCS_BASE_URL`` exists for
    deployments that front ``/data/documents`` with a read-only web server.
    """
    base = os.getenv("PUBLIC_DOCS_BASE_URL", "").strip()
    if not base or not relative_path:
        return None
    return f"{base.rstrip('/')}/{relative_path}"
