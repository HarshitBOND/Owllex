# LexVert RAG Pipeline — Concept & Architecture

Status: **intake is built; retrieval is still design.** This document is the working reference for building a legal-document RAG system that hallucinates as little as possible. The acquisition + intake half now exists (`rag/scrapping/`, `rag/ingest.py` — scrape, store to R2, extract text, track state); everything from chunking onward is still the plan we build against. `TODO.md` tracks which is which.

**Corpus order:** the first intake is **India Code** - Central acts and rules - so `document_type: "statute_section"` (Schema B) and the lineage subsystem are what v1 actually exercises. Judgments follow after; the SCI documents already ingested are the sample the chunking and extraction numbers were measured against, not the launch corpus.

## Why plain RAG isn't enough for Indian legal documents

Standard RAG (chunk → embed → cosine-similarity retrieval) fails on several query shapes that come up constantly in legal work:

- **Enumerative / filtered queries** — *"give me the cases of rape after 2023"*. Embeddings have no concept of dates or counting. Semantic search will return topically-similar chunks, not a correct, complete filtered set.
- **Exact quotes** — *"quote me Section 302 IPC"*. Semantic search retrieves the most similar-*meaning* chunk, which is often a paraphrase or a neighboring clause, not the exact text.
- **Amendment / supersession lineage** — *"is this law still in practice? what amended it?"*. This isn't a retrieval problem at all — it's a **graph traversal** problem over legal instruments. Answering from a repealed or superseded provision is the single most damaging hallucination this system can produce, because it looks authoritative and is wrong.

Retrievers are not intelligent — they find *similar text*, not *correct facts*. The fix is to stop routing every query through one retrieval mechanism, and instead give the system multiple retrieval tools plus enough structured knowledge about each document to know when semantic search is the wrong tool.

## High-level shape

```
INGESTION (offline, per document)
  raw document
    → parse
    → structure-aware chunking
    → LLM metadata extraction (front matter → schema; outbound refs kept as raw strings)
    → embed chunks (OpenAI text-embedding-3-small)
    → write chunk + vector + metadata → Chroma
    → write document record + outbound refs → MongoDB

LINK BUILDING (offline, corpus-wide, no LLM — re-runnable)
    → resolve raw citation strings → document_id
    → invert resolved edges → overruled_by / amended_by / repealed_by
    → derive precedential_status / force_status from those edges

QUERY TIME (online, per user question)
  user query
    → agentic decision engine (classifies query type)
    → routes to one or more retrieval subsystems
    → lineage/force-status check on anything cited
    → synthesis with citations → answer
```

Three stores, doing different jobs:
- **Chroma** — vector search + per-chunk metadata filtering. Fast for "find things like X" and "find things like X where Y."
- **MongoDB** — already the app's datastore (`pymongo`, cause-list parser). Reused here for structured relational facts that need *traversal*, not filtering — amendment chains, force-status, and anything closer to a graph than a document.
- **Object storage (Cloudflare R2)** — the original source PDF for every ingested document is kept here, keyed so a chunk/citation can link back to it. This is what lets an answer come with "here's the actual PDF page this came from" so a lawyer can verify the source instead of trusting the model's paraphrase.

## Ingestion pipeline

1. **Document intake** — judgment PDFs, bare acts/statute text, etc. Parsed with **Docling** (replaces both `pdfplumber` and the earlier PyMuPDF choice). Docling does layout analysis, table-structure recovery and OCR in a single pass and emits **Markdown**, so document structure — headings, section numbers, tables — survives extraction instead of collapsing into a flat text blob. That structure is load-bearing for the next stage: the chunker splits on it. OCR remains part of intake, since a meaningful share of older Indian judgments and gazetted acts only exist as scans — but it runs as a **fallback, not the default pass**: a document is read from its text layer first, and only retried with OCR if that comes back empty. Measured on real SCI judgments, forcing OCR on a text-layer PDF was 50% slower and returned *less* text (35k chars vs 46k) because the OCR pass errored on some pages. Same coverage guarantee, a fraction of the cost — and since OCR is the slowest stage, that difference is what makes a 50,000-document run finish. The source PDF is also pushed to object storage (Cloudflare R2) at this stage, keyed for later citation linking.
2. **Structure-aware chunking** — chunk boundaries follow meaning/structure (section breaks, paragraph breaks in judgments) rather than fixed token windows, so a chunk doesn't split a clause mid-thought. `chunk_size = 512`, `chunk_overlap = 80`, both in tokens — sized from measured paragraph and sentence lengths in this corpus, see the Chunking section below.
3. **LLM metadata extraction** — an LLM call (OpenAI) reads the document (front matter is usually enough — case header, or a statute's preamble/section header) and fills a structured metadata schema. This is the layer that gives the system facts retrieval can't infer.
4. **Embedding** — each chunk embedded with `text-embedding-3-small`.
5. **Storage** — chunk text + embedding + per-chunk metadata into Chroma; document-level metadata records and relational facts (amendments, force-status) into MongoDB; source PDFs into Cloudflare R2.

This MongoDB usage is scoped to the RAG pipeline's own data (document records, `statute_relations`). Application-level data — user accounts, AI chat history, user projects — is a separate concern that also lives in MongoDB (it's already the backend's datastore), but isn't part of this document's design; it doesn't affect the RAG schema below.


## Chunking: sized from the corpus, not from defaults

Chunk size and overlap are the two numbers that quietly set both retrieval quality and most of the vector-store bill, so they are measured against real documents rather than inherited from a tutorial. Token lengths over the judgment bodies in `rag/data/processed/sci/`:

| | median | p75 | p90 | p95 | p99 |
|---|---|---|---|---|---|
| Sentence | 34 | 53 | 79 | 94 | 138 |
| Body paragraph | 95 | 272 | 471 | 531 | 587 |

**`chunk_size = 512` tokens.** The retrievable unit in a judgment is an argumentative paragraph, and p90 of those is 471 tokens — a 512-token window keeps ~93% of them whole. The 300 originally sketched here force-splits **23%** of paragraphs mid-argument against 512's **7%**: a 3x increase in precisely the failure this design says it wants to avoid. 512 is also where the curve flattens. A 640 ceiling would split nothing at all in the sample, but that is fitting to three documents, and a 640-token vector is close enough to a full page that it averages several distinct points into one diffuse embedding.

Nothing about 512 is a model constraint — `text-embedding-3-small` accepts 8,191 tokens per input, ~16x this. The ceiling is a retrieval-precision choice, and it is affordable here because exact-quote lookup is delegated to the lexical index rather than being asked of the vector store.

**`chunk_overlap = 80` tokens (~16%).** Overlap does exactly one job: stop a boundary forced mid-paragraph from orphaning half a sentence. p90 of sentences in this corpus is 79 tokens, so an 80-token window swallows nine sentences in ten whole. 50 would cover only p75; chasing the long tail (p99 = 138) would buy those rare cases at a price paid on every chunk in the corpus. At 512/80 the stride is 432, so ~19% of tokens get embedded twice — inside the standard 10-20% band, and no worse than the 300/50 pairing it replaces.

One refinement, deliberately not built yet: `RecursiveCharacterTextSplitter` applies overlap at *every* boundary, including the ~93% that land cleanly on a paragraph break and need none. Suppressing it on semantic boundaries and keeping it only at forced splits would roughly halve re-embedded tokens. Not worth a custom splitter up front — noted for if embedding cost ever becomes the binding constraint.


## Metadata: canonical schema

Every field below earns its place against one of two jobs: (a) let a filtered/enumerative query work (date, category), or (b) capture a **connection between documents** — an act repealed by a newer act, a judgment overruled by a later one. That second job is the whole point of this layer: a flat `"status": "good_law"` string can't answer "overruled by what," only a link to the other document can. If a field does neither job, it isn't here — this is not a general-purpose catalog record, it's the minimum the retrieval and hallucination-prevention logic actually needs.

**Cost discipline**: one LLM extraction call per document, reading the first few pages, fills the entire record below in a single pass. Nothing here requires a second AI call per document — no separate summarization pass, no per-judge opinion classification that would need the full judgment text. Cost scales with document count, not with schema size. The connection fields are not filled by that call at all - they are derived afterwards by a non-LLM pass (see **Building the connection fields** below), so they add coverage without adding spend.

Pipeline/system config — which embedding model is active, chunk counts, pipeline version — is not document metadata. It's the same for every document and belongs in code/config, not repeated on every record.

### Core fields (every document)

```json
{
  "document_id": "ESCR010002472026",
  "document_type": "judgment",
  "title": "K.S. Puttaswamy v. Union of India",
  "jurisdiction": "India",
  "source_file": "Puttaswamy_2017.pdf",
  "storage_ref": "raw/sci/9f2c...<sha256>.pdf",
  "needs_review": false
}
```

- `document_id` — **the identifier the source already assigns**, not a generated slug: the CNR for a judgment, the act/section identifier for an India Code entry. `rag/ingest.py` already derives it (the manifest's `cnr`, or the filename stem), and it is what the ledger, Mongo and Chroma all key on. The readable slugs sketched earlier (`sc_2017_puttaswamy`) are dropped - something would have to generate and deduplicate them, and that something would be an LLM inventing primary keys.
- `storage_ref` — the R2 object key for the source PDF, so an answer can point a lawyer at the actual document. Keys are content-addressed (`raw/<source>/<sha256>.pdf`), which makes upload idempotent across a resumable bulk run; `storage.presigned_url()` turns one into a time-limited link at answer time. The bucket name is config, not part of the stored reference.
- `needs_review` — single flag the extraction call sets when unsure about a field (unclear scan, ambiguous connection). One flag is enough to route a document to human review; no per-field confidence scores.

### Schema A — Case law / judgments (`document_type: "judgment"`)

```json
{
  "case_name": "K.S. Puttaswamy v. Union of India",
  "citation": "(2017) 10 SCC 1",
  "court": "Supreme Court of India",
  "judgment_date": "2017-08-24",
  "bench": ["J.S. Khehar", "D.Y. Chandrachud", "R.F. Nariman"],
  "subject_tags": ["privacy", "fundamental rights"],

  "cites": [
    {"raw": "Kharak Singh v. State of U.P., (1964) 1 SCR 332",
     "type": "case", "treatment": "overruled", "document_id": null}
  ],

  "precedential_status": "good_law",
  "overruled_by": [],
  "affirmed_by": []
}
```

- `judgment_date` — real date, not just year, since "cases after 2023" needs it; year is derivable from it.
- `subject_tags` — what makes "cases of rape after 2023"-style filtering possible; filled from the same first-pages read, no extra cost. Comes straight out of the reporter's `## List of Keywords`.
- `cites` — **extracted.** One array for both prior cases (`## Case Law Cited`) and statutes applied (`## List of Acts`), discriminated by `type`, each carrying the reporter's own `treatment` annotation. This replaces the earlier flat `statutes_cited` list of invented IDs: the resolver treats cases and statutes uniformly, so one array is simpler than two.
- `precedential_status` + `overruled_by` / `affirmed_by` — **derived, never extracted.** These name *what* overruled or affirmed the case rather than asserting a bare status word, but that information lives in later documents, so it is written by the Phase B pass described below - not by the extraction call.
- Deliberately left out: parallel citations, case number, bench strength, per-judge opinion type (majority/dissenting — would need the full judgment text to classify correctly, not just front matter), parties, case type, disposal nature, procedural status, appeal lineage, keywords, an LLM-generated headnote. None of these serve either job above; they're identification detail that can be added later against a concrete need, not defaulted in now.

### Schema B — Statutes / Bare Acts / Sections (`document_type: "statute_section"`)

```json
{
  "act_name": "Indian Penal Code, 1860",
  "section_number": "302",
  "enactment_date": "1860-10-06",
  "subject_tags": ["criminal law"],

  "cites": [
    {"raw": "The Indian Penal Code (Amendment) Act, 1983",
     "type": "statute", "treatment": "amends", "document_id": null}
  ],

  "force_status": "in_force",
  "amended_by": ["bns_2023_sec_101"],
  "repealed_by": null
}
```

- `cites` — **extracted**, same shape as Schema A. An amending or repealing act states outbound what it acts upon ("...the Indian Penal Code is hereby amended..."), which is exactly the edge Phase B inverts. The earlier `amends` field is folded into this.
- `force_status` + `amended_by` / `repealed_by` — **derived, never extracted.** These are the fields this schema exists for - the "act repealed, new act put in its place" connection - and they are written by the Phase B inversion pass, mirrored here from the `statute_relations` layer for the document record.
- `enactment_date` + `force_status` already answer "is this in force" — the operative question. Left out: act number/year, chapter, parent-act linkage, effective-date-of-current-text, jurisdiction level — identification detail, not something retrieval or hallucination-prevention needs.

### Where this data lives

The JSON above is the MongoDB document record (source of truth) — a `documents` collection, one record per ingested document. Chroma per-chunk metadata carries only a flattened scalar subset for filtering (`document_id`, `document_type`, `jurisdiction`, `precedential_status`/`force_status`, a date field) — Chroma metadata values must be flat scalars (str/int/float/bool), so arrays and nested objects (bench, tag lists, connection links) don't go there; a retrieved chunk is joined back to its full record in Mongo by `document_id`.

## Building the connection fields: extract outbound, derive inbound

The connection fields are the reason this metadata layer exists, and they are the one part of the schema an extraction call **cannot** fill. `overruled_by`, `affirmed_by`, `amended_by` and `repealed_by` all describe what a *later* document did to this one. A judgment does not know it will be overruled; measured across the SCI judgments in `data/processed/sci/`, not one of them contains any marker about its own standing. An extractor asked for those fields returns `[]` every time, `precedential_status` defaults to `good_law` for the whole corpus, and the mandatory lineage check below silently passes on everything - the safety guarantee resting on a field nothing ever writes.

What a document *does* state is the **outbound** direction, and the reporter hands it over already annotated: `## Case Law Cited` lists prior authority with its treatment (`- referred to.`), `## List of Acts` lists the statutes applied. So links get built in two phases, and only the first one costs an API call.

**Phase A - extract outbound, per document, as printed.** The extraction call fills one `cites` array with the references the document itself makes. It emits citations **verbatim as they appear**, never a generated ID: asking a model to invent a foreign key produces `constitution_art_21` on one document and `art_21_constitution` on the next, and the two never join.

```json
"cites": [
  {"raw": "SCG Contracts (India) Pvt Ltd v. K.S. Chamankar Infrastructure Pvt Ltd [2019] 3 SCR 1050 : (2019) 12 SCC 210",
   "type": "case", "treatment": "referred_to", "document_id": null},
  {"raw": "Commercial Courts Act, 2015", "type": "statute", "treatment": "applied", "document_id": null}
]
```

**Phase B - resolve and invert, corpus-wide, no LLM.** A deterministic pass over Mongo, re-runnable at any time:

1. **Resolve** - normalize each `raw` string to a `document_id` by citation pattern plus lookup. Legal citations are highly structured (`(2019) 12 SCC 210`, `Section 302 IPC`), so this is regex and a table, not a model call. A reference that resolves to nothing keeps `document_id: null` and its `raw` string - a dangling ref, not a dropped one.
2. **Invert** - for every resolved edge `A --overrules--> B`, write `A` into `B.overruled_by`. Same shape for `affirmed_by`, `amended_by`, `repealed_by`.
3. **Derive status** - `precedential_status` and `force_status` are computed from the inverted edges, never extracted.

Two consequences worth stating plainly. Ingest order stops mattering: a case cited before it is ingested simply stays dangling until the pass runs again and lights it up. And the inbound fields are a **materialized view, not a fact recorded at ingest** - they are only as current as the last Phase B run, which is the honest description of what any citator can offer.


## Amendment lineage: a relational layer, not flat metadata

This is the part that's easy to get wrong: bolting `amends`/`amended_by` onto each chunk's metadata as flat fields *looks* right but is the wrong storage shape. Lineage questions are traversal ("what's the current version of this section, and what changed, and when") — a fundamentally different access pattern than chunk filtering ("find chunks where date > 2023").

Model it as a small relational structure in MongoDB, e.g. a `statute_relations` collection keyed by a stable statute/section ID:

```
{
  statute_id: "ipc_302",
  amends: ["ipc_302_1973"],
  amended_by: ["criminal_law_amendment_2023"],
  repealed_by: null,
  in_force: true,
  effective_date: "2023-07-01"
}
```

Chunk metadata in Chroma can carry a denormalized `force_status`/`current` flag for cheap filtering, but the relational layer is the source of truth, and any lineage question should traverse it directly rather than trying to reconstruct history from scattered chunk fields.

## Retrieval: three subsystems, not one

| Subsystem | Backs | Query shape |
|---|---|---|
| **Semantic** (Chroma vector search) | Conceptual/topical questions | "what does the law say about X" |
| **Structured filter** (Chroma metadata / Mongo query) | Enumerative questions | "cases after 2023", "all cases under Section X" |
| **Lexical / exact-match** (full-text index) | Direct quotes, exact clause lookup | "quote me Section 302" |
| **Lineage traversal** (Mongo `statute_relations`) | Amendment/force-status questions | "is this still law", "what amended this" |

Note: Chroma alone doesn't serve exact-match well — semantic similarity will surface a *close* chunk, not the *exact* one. This needs a lexical index alongside the vector store (Mongo text index, or a BM25 layer) — flagged as an open build item, not yet decided.

Lineage traversal isn't really a "retriever" in the RAG sense — it's a lookup against the relational layer above, but it's listed here because the agentic router treats it as one of the tools it can reach for.

## Agentic decision engine

```
query
  → classify query type (semantic / filter / exact-quote / lineage — can be more than one)
  → route to matching subsystem(s), optionally combined
      (e.g. semantic search *filtered* by date/category)
  → mandatory lineage/force-status check on anything the answer would cite
  → synthesize answer with citations back to source chunk + document
```

**Design choice: classify up front, don't fall back.** The alternative — try semantic search first, fall back to other subsystems if it looks insufficient — is simpler to build but risks silently answering from the wrong subsystem instead of admitting no direct match. Given how costly a confident-but-wrong legal answer is, upfront classification is the safer default here.

## Hallucination mitigation, as system-level rules

- Every answer must ground back to a retrieved chunk with a citation. No supporting chunk → say so, don't answer from parametric knowledge.
- Any statute/section cited in an answer must pass the lineage/force-status check before being surfaced — never present an amended/repealed provision as current without saying so.
- Low-confidence metadata extractions are flagged for review, not silently defaulted, since bad metadata poisons the structured-filter and lineage subsystems silently.

## Open questions (not resolved yet)

- ~~Chunking specifics~~ — resolved above (see **Chunking: sized from the corpus**): `chunk_size = 512`, `chunk_overlap = 80`, measured in tokens against real judgment paragraph and sentence lengths rather than assumed. Worth re-measuring once bare acts and High Court judgments are in the corpus — the numbers come from SCI judgment bodies, which is the hardest case but not the only one.
- **Data sourcing for lineage** — *mechanism* resolved above (outbound extraction + Phase B inversion); the remaining question is **coverage**. Inversion only knows about amendments an ingested instrument declares, so a section amended by an act not yet in the corpus stays wrongly `in_force`. India Code publishes repeal/amendment status directly, so the first corpus may supply this as ground truth rather than needing inference - to confirm once the India Code intake is specified.
- **Citation resolver coverage** — what fraction of `raw` strings actually resolve to a `document_id`? Unmeasurable until the pilot; if it is low, the lineage subsystem is thin no matter how correct the mechanism is. Worth reporting as a pilot metric alongside cost.
- **Query-time cost is unbudgeted** — the ₹5,000 cap covers ingestion only. Every user question costs a router call plus a synthesis call carrying ~10 chunks x 512 tokens. That is the *recurring* bill, and the one that scales with usage rather than corpus size; it needs its own number before launch.
- **Chunk-level dedup conflicts with citation linking** — cost lever #5 below proposes deduping identical chunks across documents, but a shared chunk can carry only one `document_id` / `storage_ref`, so an answer citing it would point a lawyer at the wrong PDF. Document-level dedup (content hash, already in `ledger.py`) is safe; chunk-level needs either a chunk-to-documents back-reference or dropping the lever.
- **Re-ingestion/versioning** — when a statute is amended, does it get a new chunk version (old text kept, marked historical) or mutated in place? Historical versions matter for cases decided under old law.
- **Lexical index choice** — Mongo text index vs. a dedicated BM25 layer, for the exact-quote subsystem.
- **Chroma deployment model** — local/persistent client vs. a hosted Chroma instance — not decided. The sizing that should decide it: at 512/80, judgments of this length yield ~20 chunks each, so 50,000 documents is ~1M vectors, and `text-embedding-3-small` at its default 1,536 dimensions is 6 KB per vector — **~6 GB** of raw floats before Chroma's own index overhead. (The old 300/50 pairing would have been ~35 chunks/doc, ~10 GB.) If that is too large for the chosen deployment, `text-embedding-3-small` supports the `dimensions` parameter (Matryoshka truncation): 768 or 512 dimensions halves or quarters the footprint at some recall cost. Measure that on the Phase 0 pilot rather than guessing.
- ~~Chroma vs. Mongo boundary~~ — resolved above: full record in Mongo, flattened scalar subset denormalized to Chroma per-chunk metadata for filtering.
- ~~OCR engine~~ — resolved: Docling handles it in-pipeline. What is still unmeasured is OCR *throughput* on this corpus — it is by far the slowest stage, and 50,000 documents makes that a scheduling question (see the Phase 0 pilot).

## Locked decisions

- First corpus: **India Code** (Central acts and rules) - Schema B and lineage are what v1 exercises; judgments follow
- Document identity: **the source-assigned ID** (CNR / India Code section identifier), never an LLM-generated slug
- Citation references: extracted **verbatim as raw strings**, resolved to `document_id` by a separate deterministic pass
- Connection fields: **outbound extracted, inbound derived** by a re-runnable non-LLM inversion pass
- Vector store: **Chroma**
- Embeddings: **OpenAI `text-embedding-3-small`** — 1,536 dimensions by default, 8,191-token input limit; the `dimensions` parameter is held in reserve as a storage lever, not used by default
- Chunking: **`chunk_size = 512` / `chunk_overlap = 80`**, measured in tokens via a `tiktoken` length function, splitting on Docling's Markdown headings first — sized from this corpus, see the Chunking section
- Agentic LLM calls (extraction, routing, synthesis): **OpenAI**
- Relational/lineage store: **MongoDB** (reusing the backend's existing datastore)
- PDF text extraction: **Docling** (Markdown output, layout + table structure preserved)
- OCR for scanned/no-text-layer documents: handled inside Docling, triggered as a **fallback** when a document's text layer comes back empty — never forced on every document
- Docling layout model runs on **ONNX Runtime**, not torch: the torch engine segfaults on Windows/CPU (reproducible with Docling's own CLI). Configurable via `RAG_DOCLING_LAYOUT_ENGINE`
- Source document storage: **Cloudflare R2**, content-addressed at `raw/<source>/<sha256>.pdf`, linked back from citations so answers can point to the original PDF
- Ingest bookkeeping: **SQLite** (`rag/data/ledger.sqlite3`) — content-hash dedup and per-document status, so a 50,000-document run is resumable. Local batch state only; it is not application data and does not belong in Mongo

## Cost-controlled bulk ingestion (50,000 documents, target ≤ ₹5,000)

Target: ingest ~50,000 documents (parse → chunk → metadata extraction → embed) for **≤ ₹5,000 total AI spend** (embeddings + LLM metadata calls; excludes document acquisition and self-hosted OCR compute, neither of which are per-call API costs). At that volume, the budget is roughly **$0.0012/document** — workable, but only if the cost levers below are actually pulled, not left as defaults.

### The levers, ranked by impact

1. **Cheap model tier for extraction.** Metadata extraction is a bounded structured-output task reading a page or two of front matter — it does not need a frontier model. Use the cheapest tier capable of reliable structured JSON output (mini/nano class). This is the single biggest lever: chat-completion pricing per token runs far above embedding pricing, so an oversized model here dominates total cost.
2. **Truncate input, always.** The extraction call gets front matter only (first ~1-2 pages / ~1,000 tokens) — never the full document body. Input token count must be capped by design, not by hoping documents are short.
3. **Batch API for both calls.** Neither embedding nor metadata extraction needs a live response — this is a one-time bulk job with no latency requirement. OpenAI's Batch API runs at roughly half the synchronous price for both endpoints. Skipping this doubles the bill for no reason.
4. **One LLM call per document, not per chunk.** Already the design (see Metadata section above) — metadata extraction cost scales with document count, chunking/embedding cost scales with chunk count. Don't let the two get conflated.
5. **Dedup before spending.** The same statute section gets cited verbatim across many judgments. Hash the extracted text before chunking/embedding/extracting; if a chunk's content has already been processed under another document, link to the existing record instead of paying to re-embed and re-extract identical text.
6. **Self-hosted OCR.** A paid cloud OCR API charges per page and isn't part of the "AI cost" the ₹5,000 figure is scoped to, but it's real money on top if used. Run OCR locally (e.g. Tesseract) for the scanned-document share of the corpus instead.

### Phase 0 — Calibrate before committing spend (do this first)

Run the full pipeline end-to-end on a random sample of ~300-500 documents, chosen to represent the actual mix (short orders, long judgments, statute sections, some scans). Measure the real numbers this plan is currently estimating: average tokens/doc into the embedding step (post-chunking, post-overlap), average input/output tokens for the extraction call, and actual dollars spent on that sample via the billing dashboard. Multiply up to 50,000 and compare against the ₹5,000 cap.

This step exists because the estimate above (~$20-40) is built from generic per-token rates, not this specific corpus — real Indian judgments may run longer or shorter, front matter may need more or less context than assumed, and pricing may have moved since. Don't submit the full 50k-document batch until the pilot's real per-document cost is known and confirmed to fit with margin.

### Phase 1 — Hard spend cap, not just an estimate

However good the pilot numbers look, don't rely on a single upfront calculation for a 50,000-document commitment. Track cumulative spend (tokens processed × known rate) as batches complete, and process in tranches (e.g. 5,000-10,000 documents at a time) rather than submitting all 50,000 at once — a bad calibration then costs 10-20% of budget to discover, not 100%. Halt automatically if projected total spend crosses a safety threshold (e.g. 80% of the ₹5,000 cap) before the remaining tranches run.

### Phase 2 — Execution order

1. Stage the 50,000 source documents (acquisition/scraping is a separate concern from this budget — flagged, not covered here).
2. Dedup by content hash before any paid processing.
3. Run the Phase 0 pilot; confirm real cost/document fits the cap with margin.
4. Submit remaining documents in tranches via the Batch API (both extraction and embedding calls), tracking cumulative spend against the Phase 1 cap between tranches.
5. Reconcile actual total spend against the ₹5,000 target once all tranches complete.
