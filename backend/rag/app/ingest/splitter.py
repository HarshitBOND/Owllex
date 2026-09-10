"""Chunking, with each chunk tagged by the page it came from.

Splitting happens over the *whole* document rather than page by page: a
paragraph that runs across a page break is one thought, and cutting it at the
break costs retrieval quality for no reason. Page numbers are recovered
afterwards by mapping each chunk's character offset back onto the page ranges,
which is what fills SQLite's ``page_number`` column and lets a citation open the
original PDF at the right place.

SemanticChunker is deliberately not used: it embedded every sentence just to
find split points, so each document paid two full embedding passes. With a local
model that is compute rather than API spend, but it is still the single most
expensive stage in the pipeline. Recursive splitting is free and holds retrieval
quality at this chunk size.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Chunk:
    """One unit of retrieval."""

    text: str
    page_number: int | None


@dataclass(frozen=True)
class PageSpan:
    """Half-open character range ``[start, end)`` of one page in the joined text."""

    page_number: int
    start: int
    end: int


PAGE_SEPARATOR = "\n\n"


def join_pages(pages: list[str]) -> tuple[str, list[PageSpan]]:
    """Concatenate pages and record where each one landed.

    Returns the joined text plus the offsets needed to map a chunk back to its
    page. Page numbers are 1-based, matching how a PDF viewer counts.
    """
    parts: list[str] = []
    spans: list[PageSpan] = []
    cursor = 0
    for index, page in enumerate(pages):
        page = page or ""
        if index:
            cursor += len(PAGE_SEPARATOR)
            parts.append(PAGE_SEPARATOR)
        spans.append(PageSpan(page_number=index + 1, start=cursor, end=cursor + len(page)))
        parts.append(page)
        cursor += len(page)
    return "".join(parts), spans


def page_for_offset(spans: list[PageSpan], offset: int) -> int | None:
    """The page a character offset falls on, or the nearest preceding one."""
    if not spans:
        return None
    candidate = spans[0].page_number
    for span in spans:
        if span.start > offset:
            break
        candidate = span.page_number
    return candidate


def split_pages(
    pages: list[str],
    chunk_size: int = 2000,
    chunk_overlap: int = 200,
) -> list[Chunk]:
    """Split a paged document into page-tagged chunks."""
    text, spans = join_pages(pages)
    if not text.strip():
        return []

    from langchain_text_splitters import RecursiveCharacterTextSplitter

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        add_start_index=True,
    )
    documents = splitter.create_documents([text])
    return [
        Chunk(
            text=document.page_content,
            page_number=page_for_offset(spans, document.metadata.get("start_index", 0)),
        )
        for document in documents
        if document.page_content.strip()
    ]


def semantic_chunk(text: str, chunk_size: int = 2000, chunk_overlap: int = 200) -> list[str]:
    """Split a single string. Kept for callers that have no page structure."""
    return [chunk.text for chunk in split_pages([text], chunk_size, chunk_overlap)]
