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
from typing import Any, Sequence

from rag.core.services import RagServices
from rag.core.vector_index import PUBLIC_COLLECTION, USER_COLLECTION, SearchFilter, SearchHit

logger = logging.getLogger("ravenslaw.rag.retrieval")

# Reciprocal-rank-fusion constant. 60 is the value the original RRF paper
# (Cormack, Clarke & Buettcher, 2009) settled on, and the one most fusion
# implementations since have kept -- see PRODUCTION_TODO.md T7.
_RRF_K = 60


def _reciprocal_rank_fusion(
    dense_hits: Sequence[SearchHit], lexical_hits: Sequence[tuple[int, float]]
) -> list[SearchHit]:
    """Merge two independently-ranked hit lists into one, by rank position.

    Dense cosine similarity and BM25 cost live on incomparable scales, so
    summing or averaging the raw scores would let whichever lane happens to
    produce larger numbers dominate regardless of how good its matches
    actually are. RRF sidesteps that: each id's fused score is
    ``sum(1 / (_RRF_K + rank))`` over every list it appears in, using each
    list's own 1-based rank rather than its score. A chunk that is the literal
    text of the query -- a citation, a section number -- typically lands at
    lexical rank 1 regardless of how the dense embedding happens to place it,
    which is what lets an exact citation query outrank a merely
    semantically-similar chunk after fusion.

    Both inputs are assumed already sorted best-first, which is true of a
    single FAISS call and of :meth:`SqliteStore.search_lexical`'s own
    ``ORDER BY``.
    """
    scores: dict[int, float] = {}
    for rank, hit in enumerate(dense_hits, start=1):
        scores[hit.faiss_id] = scores.get(hit.faiss_id, 0.0) + 1.0 / (_RRF_K + rank)
    for rank, (faiss_id, _score) in enumerate(lexical_hits, start=1):
        scores[faiss_id] = scores.get(faiss_id, 0.0) + 1.0 / (_RRF_K + rank)
    return [
        SearchHit(embedding_id=faiss_id, score=score)
        for faiss_id, score in sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    ]


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

        fetch_k = services.config.overfetch_k(top_k)
        vector = services.embedder.embed_query(query)
        dense_hits = services.indexes.global_index().search(vector, fetch_k, scope=scope)
        lexical_hits = services.metadata.search_lexical(query, scope, fetch_k)

        fused = _reciprocal_rank_fusion(dense_hits, lexical_hits)
        if not fused:
            return []

        return self._hydrate(fused)[:top_k]

    def search_lexical(
        self,
        query: str,
        owner_id: str | None = None,
        top_k: int = 10,
        *,
        include_public: bool = True,
        collection: str | None = None,
        document_id: str | None = None,
    ) -> list[RetrievedChunk]:
        """BM25-only search, over the same tenant-scoped slice as :meth:`search`.

        The lexical counterpart of :meth:`search`: useful standalone for a
        query that is really a citation or section-number lookup, and this is
        also what :meth:`search` calls internally before fusing its results
        with the dense lane. Scoping is computed the same way and by the same
        code (:meth:`_scope_for`) as the dense path, so the two can never
        disagree about what a tenant may see.
        """
        if not query.strip() or top_k <= 0:
            return []

        services = self._services
        scope = self._scope_for(owner_id, include_public, collection, document_id)
        if scope.matches_nothing:
            return []

        fetch_k = services.config.overfetch_k(top_k)
        hits_raw = services.metadata.search_lexical(query, scope, fetch_k)
        if not hits_raw:
            return []

        hits = [SearchHit(embedding_id=faiss_id, score=score) for faiss_id, score in hits_raw]
        return self._hydrate(hits)[:top_k]

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
        """Join FAISS hits back to their chunk rows, dropping any that are gone.

        Re-sorts by score after hydration rather than trusting FAISS's own
        order. Harmless when ``hits`` is already sorted (the common case: one
        FAISS call, nothing dropped) and necessary the moment it isn't --
        PQ/IVF distances are approximate over an over-fetched candidate set,
        so the true top-k can sit anywhere in it, and a future caller that
        merges hits from more than one search (T7's lexical fusion) cannot
        assume a single sorted order going in.
        """
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
        results.sort(key=lambda r: r.score, reverse=True)
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

        fetch_k = self._services.config.overfetch_k(k)
        vector = self._services.embedder.embed_query(query)
        dense_hits = self._services.indexes.global_index().search(vector, fetch_k, scope=scope)
        lexical_hits = self._services.metadata.search_lexical(query, scope, fetch_k)

        fused = _reciprocal_rank_fusion(dense_hits, lexical_hits)
        return self._hydrate(fused)[:k] if fused else []


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
