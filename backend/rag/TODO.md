# LexVert RAG — Implementation Workflow & TODO

Companion to `ARCHITECTURE.md` (the concept/decisions doc). This file is the concrete build plan: how a document actually moves through the pipeline, which LangChain pieces do which job, and the order to build things in. Nothing here overrides a decision already locked in `ARCHITECTURE.md` — this is "how," that doc is "what/why."

## Processing model: one document at a time

The pipeline processes documents sequentially, one fully through the whole flow (load → parse → chunk → extract metadata → embed → store) before starting the next — not staged bulk passes (parse everything, then chunk everything, etc).

Why this matters beyond simplicity: it makes the run **resumable**. Each document's status is tracked in a SQLite ledger (`rag/ledger.py`) keyed by content hash — local batch state, not application data, so it does not belong in Mongo. If the job dies at document 30,000 of 50,000, restarting skips the first 30,000 instead of reprocessing — and re-paying for — them. Given the ₹5,000 budget, that's not a nice-to-have, it's what keeps a crash from becoming a second bill.

This does **not** conflict with the Batch API cost-saving plan from `ARCHITECTURE.md`. The per-document function still builds one request per document; those requests get submitted in batch tranches, and results are applied back one document at a time as they return. The code stays written "per document" throughout.

## LangChain components, one per pipeline stage

| Stage | Component | Notes |
|---|---|---|
| Load | **Already done, outside LangChain** — `rag/extract.py` (Docling) | Docling converts the PDF to Markdown (layout + tables + OCR in one pass) and `rag/ingest.py` writes it to `rag/data/processed/<source>/<doc_id>.md`. The chunker reads those `.md` files, so there is no LangChain loader in this stage — `TextLoader`, or just `Document(page_content=path.read_text())`. The parsing work is finished by the time LangChain sees a document. |
| Chunk | `RecursiveCharacterTextSplitter` | **Not** `SemanticChunker` — see note above, it costs extra embedding calls to compute its own split points. Input is Docling Markdown, not raw PDF text, so the separator list leads with Markdown headings (the `##` / `###` Docling emits for section breaks) before falling back to blank lines and paragraph/section-number patterns, so splits still respect document structure, at `chunk_size=512`, `chunk_overlap=80`, measured in tokens (use a `tiktoken`-based length function, not raw character count, so the sizing actually matches what was decided). |
| Extract metadata | One `with_structured_output()` call per document, bound to a Pydantic model | Input is front matter only (first ~1-2 pages) — never the full document body. Fills `cites` (outbound refs, **raw strings verbatim**) but never the inbound connection fields — those come from the Phase B pass, see `ARCHITECTURE.md`. Structured output means a malformed response is a loud validation error, not silently-bad metadata. |
| Embed | `OpenAIEmbeddings(model="text-embedding-3-small")` | One embedding call per chunk (batched via the API's native batch input, not one HTTP call per chunk). |
| Store | `Chroma` vectorstore (`langchain_chroma`) `.add_documents()` | Metadata written is the flattened scalar subset only (per `ARCHITECTURE.md`'s storage split). Full record + `statute_relations` written to MongoDB via the existing `pymongo` setup. |

## Retrieval: MMR, with metadata pre-filtering

```
vectorstore.as_retriever(
    search_type="mmr",
    search_kwargs={"k": ..., "fetch_k": ..., "lambda_mult": ..., "filter": {...}}
)
```

Why MMR specifically matters for this corpus: the same statute section gets quoted verbatim across dozens of judgments. Plain similarity search returns the k nearest chunks — which for a commonly-cited section could be 8 near-identical copies of the same paragraph from 8 different cases. MMR trades a little raw similarity for diversity, so the retrieved set actually covers different documents instead of restating the same text repeatedly.

The metadata filter (`jurisdiction`, `document_type`, `precedential_status`/`force_status`, date) must run **before** MMR selects from the candidate pool, not as a post-filter on an already-narrow top-k — otherwise the structured-filter subsystem from `ARCHITECTURE.md` isn't actually doing its job.

## Code style

Plain, one function per stage, no abstraction beyond what LangChain already provides:

```
load_document(path) -> LangChain Document(s)
chunk_document(doc) -> list[Document chunks]
extract_metadata(front_matter_text) -> Pydantic metadata object
embed_chunks(chunks) -> list[vector]
store(document_id, chunks, vectors, metadata) -> None

process_one_document(path):
    if already_done(document_id): return
    doc = load_document(path)
    chunks = chunk_document(doc)
    metadata = extract_metadata(doc.front_matter)
    vectors = embed_chunks(chunks)
    store(document_id, chunks, vectors, metadata)
    mark_done(document_id)
```

One orchestrating loop calls `process_one_document` for each source file. No class hierarchies, no plugin system, no config-driven pipeline framework — a script that reads top to bottom.

## Stage 0: getting the documents

`ARCHITECTURE.md` flags acquisition as out of scope for the cost plan, but the
pipeline can't run without a corpus staged on disk. That's `backend/rag/scrapping/`
— see its README.

**First source: India Code** (Central acts and rules), not judgments — so Schema B
is what the pilot exercises. Whether the existing YAML-recipe crawler fits it is
open: India Code is browsable structured HTML (Act → Chapter → Section) with
repeal/amendment status published directly, which may mean a section-wise
structured pull rather than a PDF-download-plus-Docling path. Spec pending.

A source is described in a YAML recipe filled in from browser dev tools
(container/link/field CSS selectors, plus a pagination mode); the crawler
handles pagination, download, retries, and content-hash dedup. Output is
`data/raw/<recipe>/manifest.jsonl`, one JSON line per document, which is what
the orchestrator loop below iterates over — `local_path` feeds `load_document()`
and `fields` carries listing-page metadata into `extract_metadata()` as hints.

Two things it deliberately does **not** do. It does not solve or bypass
CAPTCHAs: for gated sources (eCourts, SCI search) you clear the challenge in
your own browser and hand over the session via a copied cURL request, and when
that session expires the crawler stops with instructions instead of retrying
into a block page. And it does not re-download on restart — the manifest makes
runs resumable, for the same reason the per-document loop below is.

## TODO checklist

- [x] `backend/rag/scrapping/` — recipe-driven acquisition; writes the manifest
      the pipeline consumes. Verified end-to-end against the Delhi HC site.
- [ ] `backend/rag/schema.py` — Pydantic models mirroring the core fields + Schema A (judgment) + Schema B (statute_section) from `ARCHITECTURE.md`, used directly as the `with_structured_output()` target. Split the models: an *extraction* model (what the LLM fills, including `cites` as raw strings) and the *stored record* (extraction plus the derived inbound fields). Binding the derived fields to the LLM call would invite it to hallucinate them.
- [ ] `backend/rag/links.py` — the Phase B pass: resolve `cites[].raw` to `document_id` by citation pattern + lookup, invert resolved edges into `overruled_by` / `amended_by` / `repealed_by`, derive `precedential_status` / `force_status`. No LLM. Must be safely re-runnable over the whole corpus, since dangling refs resolve as later documents land.
- [x] `backend/rag/{config,ledger,storage,extract,ingest}.py` — intake: manifest → R2
      (content-addressed) → Docling Markdown → SQLite ledger. Resumable per stage;
      `python -m rag.ingest --stats` shows where a run stopped. Offline tests (R2 and
      Docling stubbed) in `backend/tests/test_ingest.py`.
- [ ] `backend/rag/chunker.py` — `RecursiveCharacterTextSplitter`, token-length function, legal-structure separators, `chunk_size=512` / `chunk_overlap=80`.
- [ ] `backend/rag/extractor.py` — structured-output metadata extraction call, front-matter-only input.
- [ ] `backend/rag/embedder.py` — `OpenAIEmbeddings` wrapper.
- [ ] `backend/rag/store.py` — Chroma `.add_documents()` + Mongo document/`statute_relations` writes. Per-document status tracking is already done by `ledger.py`; this stage adds the `chunked` / `embedded` statuses to it rather than inventing a second one.
- [ ] `backend/rag/pipeline.py` — the one-document-at-a-time orchestrator loop, skipping already-`done` documents on restart. Runs `links.py` once at the end of a run, not per document.
- [ ] `backend/rag/retriever.py` — MMR retriever setup with metadata pre-filter wired in.
- [ ] Run the Phase 0 pilot (300-500 docs, from `ARCHITECTURE.md`'s cost plan) through this actual pipeline to get real per-document cost before committing to the full 50,000-document run.
- [ ] Wire in Batch API submission for `extractor.py`/`embedder.py` once the pipeline is verified correct on the pilot batch — build correct first, batch-optimize second.
