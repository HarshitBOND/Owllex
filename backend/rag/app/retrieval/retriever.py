"""Retrieval over the single global FAISS index.

The query is embedded locally, FAISS returns ``(faiss_id, score)`` pairs, and
SQLite turns those into the text and document metadata a caller can render.

## Tenant isolation

FAISS has no metadata filtering, so the entire access-control decision is made
in SQLite and expressed to FAISS as a set of ids:

    owner_id -> SELECT faiss_id FROM chunks WHERE owner_id = ?   (indexed)
             -> faiss.IDSelectorBatch(ids)
             -> index.search(..., params.sel = selector)

Two rules hold this together, and both are load-bearing:

**1. An empty allow-list returns zero results.** It is never widened into an
unfiltered search. An empty list is not "no filter applied" -- it is the answer
"this owner has nothing indexed", and the difference is one lawyer's privileged
documents. This must never appear anywhere in this file or below it::

    if not ids:
        return search_everything()      # WRONG -- this is the leak

The correct shape, which :meth:`VectorIndex.search` enforces independently of
this module, is ``if len(ids) == 0: return []``.

**2. Public and private vectors live in disjoint id ranges.** The public corpus
is far too large to enumerate per query (at 10^8 chunks the allow-list alone
would be 800MB), so public access is an ``IDSelectorRange`` over the public
partition rather than a list. A private vector can therefore never be reached by
a public search, because its id is not in that range -- and a database trigger
refuses to write a row where those two disagree.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from rag.core.services import RagServices
from rag.core.vector_index import PUBLIC_COLLECTION, USER_COLLECTION, SearchFilter

logger = logging.getLogger("ravenslaw.rag.retrieval")


@dataclass(frozen=True)
class RetrievedChunk:
    """A hit, flattened to what the HTTP layer returns."""

    text: str
    score: float
    document_id: str
    chunk_id: str
    title: str | None
    document_type: str | None
    date: str | None
    court: str | None
    citation: str | None
    page_number: int | None
    source_url: str | None
    storage_ref: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "score": self.score,
            "document_id": self.document_id,
            "title": self.title,
            "document_type": self.document_type,
            "date": self.date,
            "source_url": self.source_url or None,
        }


class Retriever:
    """Query one collection, optionally scoped to a corpus, user or court."""

    def __init__(self, services: RagServices) -> None:
        self._services = services

    def search(
        self,
        query: str,
        owner_id: str | None = None,
        top_k: int = 10,
        *,
        include_public: bool = True,
        collection: str | None = None,
        document_id: str | None = None,
        k: int | None = None,
    ) -> list[RetrievedChunk]:
        """Search within one tenant's visible slice of the index.

        ``owner_id`` is the tenant boundary:

        * ``None``    -- the public legal corpus only. Every authenticated user
          may search it, and it contains no private document by construction.
        * ``"u_123"`` -- that owner's own documents, plus the public corpus
          unless ``include_public=False``.

        An owner with nothing indexed and ``include_public=False`` yields an
        empty allow-list, and therefore zero results. That is the intended
        behaviour, not a degenerate case to paper over.

        ``k`` is the older name for ``top_k`` and still works.
        """
        top_k = k if k is not None else top_k
        if not query.strip() or top_k <= 0:
            return []

        services = self._services
        scope = self._scope_for(owner_id, include_public, collection, document_id)
        if scope.matches_nothing:
            # Resolved to nothing. Short-circuiting here saves an embedding call;
            # VectorIndex.search would return [] for this anyway, which is the
            # invariant that actually guarantees isolation.
            return []

        vector = services.embedder.embed_query(query)
        hits = services.indexes.global_index().search(vector, top_k, scope=scope)
        if not hits:
            return []

        return self._hydrate(hits)

    def _scope_for(
        self,
        owner_id: str | None,
        include_public: bool,
        collection: str | None,
        document_id: str | None,
    ) -> SearchFilter:
        """Turn a caller's intent into the id scope FAISS will enforce.

        The only place that decides what a request may see. Kept separate from
        the search itself so the decision can be tested directly, without an
        embedding model in the way.
        """
        if owner_id is None:
            if document_id is not None:
                # A single public document: still an allow-list, because the
                # public range as a whole is not what was asked for.
                return SearchFilter.owned_by(
                    self._services.metadata.faiss_ids_for(
                        collection or PUBLIC_COLLECTION, document_id=document_id
                    )
                )
            return SearchFilter.public()

        allowed = self._services.metadata.faiss_ids_for_owner(
            owner_id, collection=collection, document_id=document_id
        )
        return SearchFilter.owned_by(allowed, include_public=include_public)

    def _hydrate(self, hits) -> list[RetrievedChunk]:
        """Join FAISS hits back to their chunk rows, dropping any that are gone."""
        records = self._services.metadata.chunks_by_faiss_ids([hit.faiss_id for hit in hits])

        results: list[RetrievedChunk] = []
        for hit in hits:
            record = records.get(hit.faiss_id)
            if record is None:
                # A vector whose row is gone: the index is ahead of the
                # database, which a rebuild fixes. Dropping it is right --
                # there is no text to return and nothing to cite. It is also the
                # safe direction: a row we cannot see is a row we cannot check
                # the owner of.
                logger.warning(
                    "Vector %d has no chunk row; index needs a rebuild", hit.faiss_id
                )
                continue
            results.append(
                RetrievedChunk(
                    text=record.chunk_text,
                    score=hit.score,
                    document_id=record.document_id,
                    chunk_id=record.chunk_id,
                    title=record.title,
                    document_type=record.document_type,
                    date=record.doc_date,
                    court=record.court,
                    citation=record.citation,
                    page_number=record.page_number,
                    source_url=record.source_url,
                    storage_ref=record.storage_ref,
                )
            )
        return results

    def search_public(self, query: str, top_k: int = 10) -> list[RetrievedChunk]:
        """The public legal corpus. Reachable by any authenticated user."""
        return self.search(query, owner_id=None, top_k=top_k)

    def search_owned(
        self, query: str, owner_id: str, top_k: int = 10, *, include_public: bool = False
    ) -> list[RetrievedChunk]:
        """One owner's own documents. Nothing else, unless public is asked for."""
        return self.search(query, owner_id=owner_id, top_k=top_k, include_public=include_public)

    def search_corpus(
        self, query: str, corpus_id: str, clerk_uid: str, k: int = 5
    ) -> list[RetrievedChunk]:
        """One advocate's corpus, scoped by both corpus and owner.

        ``clerk_uid`` is the owner and is the security boundary; ``corpus_id``
        only narrows within it. Both are applied in SQL -- narrowing in Python
        after an owner-wide fetch would be one forgotten filter away from a leak.
        """
        allowed = self._services.metadata.faiss_ids_for(
            USER_COLLECTION, corpus_id=corpus_id, clerk_uid=clerk_uid
        )
        scope = SearchFilter.owned_by(allowed)
        if scope.matches_nothing or not query.strip() or k <= 0:
            return []

        vector = self._services.embedder.embed_query(query)
        hits = self._services.indexes.global_index().search(vector, k, scope=scope)
        return self._hydrate(hits) if hits else []


def delete_corpus_documents(
    services: RagServices,
    corpus_id: str,
    clerk_uid: str,
    document_id: str | None = None,
) -> int:
    """Remove a corpus (or one of its documents) from SQLite and FAISS.

    SQLite is the source of truth for which vectors belong to the corpus, so it
    is read first and the freed ids are then dropped from the index. Returns how
    many vectors were removed.
    """
    freed = services.metadata.delete_documents(
        USER_COLLECTION,
        corpus_id=corpus_id,
        clerk_uid=clerk_uid,
        document_id=document_id,
    )
    if not freed:
        return 0
    removed = services.indexes.global_index().remove(freed)
    logger.info(
        "Deleted %d chunk(s) for corpus=%s document=%s", removed, corpus_id, document_id or "*"
    )
    return removed
