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
| Chunk | `RecursiveCharacterTextSplitter` | **Not** `SemanticChunker` — see note above, it costs extra embedding calls to compute its own split points. Input is Docling Markdown, not raw PDF text, so the separator list leads with Markdown headings (the `##` / `###` Docling emits for section breaks) before falling back to blank lines and paragraph/section-number patterns, so splits still respect document structure, at `chunk_size=512`, `chunk_overlap=80`, measured in tokens (use a `tiktoken`-based length function, not raw character count, so the sizing actually matches what was decided). **Known debt:** `rag/app/ingest/splitter.py` currently uses `SemanticChunker` against this decision, which means every document is embedded twice — once to find split points, once by Chroma. Track it as debt, not as an alternative. Keep the heading the chunk falls under and write it to the chunk's `chunk_heading` metadata. |
| Route to a family | Dict lookup on the manifest's `docType` | **No model call.** `SECTION → statute_section`, `ACT`/`ORDINANCE → statute_instrument`, `STATUTE → amendment_instrument`, `RULE → subordinate_legislation`, `SCHEDULE`/`ANNEXURE`/`SCHEDULEORDER`/`SCHORDRULE → attachment`, SCI → `judgment`. Keep the raw value in `sub_type`. An unmapped `docType` is a loud error, not a default — a silent fallback family is how junk metadata gets in. |
| Fill S fields | Copy from the manifest row | Straight assignment. This is where most of the schema comes from; see `ARCHITECTURE.md`'s provenance table for which fields per family. |
| Fill P fields | Section/regex parsers over the Markdown | Judgments: the reporter's `##` headings. Statutes: preamble, enabling section, repeal clause. Pure functions over text, no network. |
| Extract metadata | One `with_structured_output()` call, bound to a family's **extraction** model | **Only for fields the family tags L, and only if still unfilled.** For all five India Code families that is nothing, so the call does not happen. Input is front matter only (first ~1-2 pages) — never the full document body. Never bind S/P/D fields to the call: the model must not be able to overwrite a fact the source stated. Structured output means a malformed response is a loud validation error, not silently-bad metadata. |
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

The metadata filter must run **before** MMR selects from the candidate pool, not as a post-filter on an already-narrow top-k — otherwise the structured-filter subsystem from `ARCHITECTURE.md` isn't actually doing its job. The keys it filters on are the flat scalar subset written to each chunk: `document_type`, `sub_type`, `jurisdiction`, `subject_category`, `primary_date`/`year`, `act_id`, `section_number`, `court`, `force_status`, `precedential_status`, `is_current`. `retriever.py` already plumbs a `filter` argument through, but nothing constructs one and nothing calls it — building the filter from a classified query is the missing half.

## Code style

Plain, one function per stage, no abstraction beyond what LangChain already provides:

```
route(manifest_row)                  -> family name          (dict lookup)
build_record(family, manifest_row)   -> record with S fields filled
parse_fields(family, record, text)   -> record with P fields filled
missing_llm_fields(family, record)   -> list of unfilled L fields
extract_metadata(family, front_matter, fields) -> Pydantic extraction object
chunk_document(text)                 -> list[chunk], each with its heading
store(record, chunks)                -> None

process_one_document(manifest_row, path):
    if already_done(row.document_id): return
    family = route(manifest_row)
    record = build_record(family, manifest_row)
    text   = load_document(path)
    record = parse_fields(family, record, text)
    missing = missing_llm_fields(family, record)
    if missing:                                  # empty for India Code
        record.update(extract_metadata(family, text[:FRONT_MATTER], missing))
    chunks = chunk_document(text)
    store(record, chunks)
    mark_done(record.document_id)
```

The `if missing:` line is the whole cost design in one branch — for a manifest-backed India Code document it is false, so no model is called. Note the manifest row is an input to `process_one_document`, not something recovered from the file: the orchestrator iterates the manifest, not a directory listing.

One orchestrating loop calls `process_one_document` for each row. No class hierarchies, no plugin system, no config-driven pipeline framework — a script that reads top to bottom.

## Stage 0: getting the documents

`ARCHITECTURE.md` flags acquisition as out of scope for the cost plan, but the
pipeline can't run without a corpus staged on disk. That's `backend/rag/scrapping/`
— see its README.

**First source: India Code**, not judgments — so `statute_section` is what the
pilot exercises. The harvester has run: `data/raw/india_code/manifest.jsonl`
holds 85 rows across nine `docType` values, pulled from the DSpace REST API as a
section-wise structured pull rather than a PDF-download-plus-Docling path. Each
row already carries act linkage, section number, ministry, dates, repeal
booleans, `linkedIds` and per-section `footnotes[]` — which is why the metadata
design in `ARCHITECTURE.md` calls no model for this family. Note the harvester's
own source (`sources/india-code/`) is not in the tree even though its output is;
recovering or rewriting it is a prerequisite for the pilot.

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
- [ ] `backend/rag/schema.py` — a shared core model plus **one model per family** (`judgment`, `statute_section`, `statute_instrument`, `amendment_instrument`, `subordinate_legislation`, `attachment`) mirroring `ARCHITECTURE.md`. Two models per family: a *stored record* (every field) and an *extraction* model holding **only that family's L fields**, used as the `with_structured_output()` target. Five of the six extraction models are empty, which is the point — an empty one means the call is skipped, not that it is sent with nothing to do. Binding S/P/D fields to the LLM would let it overwrite ground truth.
- [ ] `backend/rag/router.py` — the `docType` → family dict, plus the manifest-row → S-field mapping per family. Raise on an unmapped `docType`. This is what replaces the prototype's LLM-guessed `document_type`.
- [ ] `backend/rag/parsers.py` — the P-tier parsers. Judgments: `## Issue for Consideration`, `## Headnotes †`, `## Case Law Cited` (semicolon groups, trailing `- referred to.` is the group treatment), `## List of Acts`, `## List of Keywords`, `## Case Arising From`, plus `Coram :` / `Decision Date :` / `Case No :` / `Bench :` out of the SCI manifest's `listingText`. Statutes: preamble, enabling section, repeal clause, `provision_label` for `SCHORDRULE`. Pure functions over text — unit-testable against the files already in `data/processed/sci/` and `data/raw/india_code/pdfs/`.
- [ ] `backend/rag/categories.py` — `actId` → `subject_category` using the vocabulary in `app/api/lib/data/acts.ts`, resolved per **act** and cached, with a ministry/department lookup before any LLM fallback. Report map coverage: the share of acts needing a model call is the whole extraction bill for the statute corpus.
- [ ] `backend/rag/links.py` — load `footnotes[]` into `amendment_events[]` and `linkedIds` into `related_instruments[]`, set `force_status` from `repealed`/`actRepealed`, then run the Phase B pass: resolve `cites[].raw` and `amendment_events[].amended_by` to `document_id` by citation pattern + lookup (`"Mah. 9 of 2021"` → jurisdiction + act number + year), invert resolved edges into `overruled_by` / `amended_by` / `repealed_by`, derive `precedential_status`. No LLM. Must be safely re-runnable over the whole corpus, since dangling refs resolve as later documents land.
- [x] `backend/rag/{config,ledger,storage,extract,ingest}.py` — intake: manifest → R2
      (content-addressed) → Docling Markdown → SQLite ledger. Resumable per stage;
      `python -m rag.ingest --stats` shows where a run stopped. Offline tests (R2 and
      Docling stubbed) in `backend/tests/test_ingest.py`.
- [ ] `backend/rag/chunker.py` — `RecursiveCharacterTextSplitter`, token-length function, legal-structure separators, `chunk_size=512` / `chunk_overlap=80`.
- [ ] `backend/rag/extractor.py` — structured-output metadata extraction call, front-matter-only input, bound to a family's extraction model and called only when that family has unfilled L fields. Also carries the **upload lane**: a file arriving through the admin UI has no manifest, so this is where it gets classified into a family before extraction.
- [ ] `backend/rag/embedder.py` — `OpenAIEmbeddings` wrapper.
- [ ] `backend/rag/store.py` — Chroma `.add_documents()` + Mongo document/`statute_relations` writes. Chroma gets the **flat scalar subset only** (`ARCHITECTURE.md`, *Where this data lives*) — assert scalar types before the call rather than letting `add_texts` raise, which is the failure the prototype hits today by writing `subject_tags` as a list. The full family record goes to Mongo. Per-document status tracking is already done by `ledger.py`; this stage adds the `chunked` / `embedded` statuses to it rather than inventing a second one.
- [ ] `backend/rag/pipeline.py` — the one-document-at-a-time orchestrator loop, skipping already-`done` documents on restart. Runs `links.py` once at the end of a run, not per document.
- [ ] `backend/rag/retriever.py` — MMR retriever setup with metadata pre-filter wired in.
- [ ] Run the Phase 0 pilot (300-500 docs, from `ARCHITECTURE.md`'s cost plan) through this actual pipeline to get real per-document cost before committing to the full 50,000-document run.

## Known debt — live admin-upload path (`backend/rag/app/ingest/`)

Separate from the bulk pipeline checklist above — this is the pipeline actually running behind the admin RAG Ingest tab today.

- **Deskew / perspective correction for photographed pages** — `loader.py` EXIF auto-orients a photo and hands it straight to RapidOCR (`OcrMode.FULL_PAGE`) with no crop/deskew/contrast step. RapidOCR has some inherent tolerance for mild skew, but a phone photo taken at an angle, with background visible, or under uneven lighting will OCR worse than a flatbed scan. Not built now — size it against real admin photo quality first, since a proper fix means a new CV dependency (e.g. OpenCV-based edge detection + perspective warp) with its own tuning and failure modes, not a one-line change.
- [ ] Wire in Batch API submission for `extractor.py`/`embedder.py` once the pipeline is verified correct on the pilot batch — build correct first, batch-optimize second.
