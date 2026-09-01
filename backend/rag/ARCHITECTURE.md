# Ravenslaw RAG Pipeline Concept & Architecture

Status: **acquisition is built; the pipeline is a thin prototype; retrieval is still design.** This document is the working reference for building a legal-document RAG system that hallucinates as little as possible.

What actually exists on disk right now, stated plainly so the rest of this doc isn't read as a description of working code:

- **Acquisition works and has run.** `rag/scrapping/` produced `data/raw/india_code/manifest.jsonl` (85 rows across 9 document types) and `data/raw/sci/manifest.jsonl` (13 judgments). Docling has converted the SCI PDFs to Markdown in `data/processed/sci/`.
- **The pipeline is `rag/app/ingest/` six files, ~60 lines.** Upload → Docling → `SemanticChunker` → one LLM metadata call over the first 3,000 characters → Chroma. It is wired to the admin UI and to nothing else. The richer intake described in earlier revisions of this doc (`rag/{config,ledger,storage,extract,ingest}.py` R2, SQLite ledger, per-stage resume) **no longer exists as source**; only stale `.pyc` files remain, and `backend/tests/test_ingest.py` fails at import because of it.
- **Nothing has been ingested.** There is no `rag/data/chroma/` directory.

So everything from chunking onward including the metadata design below is the plan we build against, not a description of behaviour. `TODO.md` tracks the build order.

**Corpus order:** the first intake is **India Code** Central and State acts, sections, rules and their attachments so `statute_section` and the lineage subsystem are what v1 actually exercises. Judgments follow after; the SCI documents already staged are the sample the chunking and extraction numbers were measured against, not the launch corpus.

## Why plain RAG isn't enough for Indian legal documents

Standard RAG (chunk → embed → cosine-similarity retrieval) fails on several query shapes that come up constantly in legal work:

- **Enumerative / filtered queries** *"give me the cases of rape after 2023"*. Embeddings have no concept of dates or counting. Semantic search will return topically-similar chunks, not a correct, complete filtered set.
- **Exact quotes** *"quote me Section 302 IPC"*. Semantic search retrieves the most similar-*meaning* chunk, which is often a paraphrase or a neighboring clause, not the exact text.
- **Amendment / supersession lineage** *"is this law still in practice? what amended it?"*. This isn't a retrieval problem at all it's a **graph traversal** problem over legal instruments. Answering from a repealed or superseded provision is the single most damaging hallucination this system can produce, because it looks authoritative and is wrong.

Retrievers are not intelligent they find *similar text*, not *correct facts*. The fix is to stop routing every query through one retrieval mechanism, and instead give the system multiple retrieval tools plus enough structured knowledge about each document to know when semantic search is the wrong tool.

## High-level shape

```
INGESTION (offline, per document)
  raw document + its manifest row
    → route to a document family (dict on the source's docType no LLM)
    → fill S fields from the manifest, P fields by parsing the text
    → LLM extraction ONLY for that family's L fields, ONLY if any are unfilled
    → parse
    → structure-aware chunking
    → embed chunks (OpenAI text-embedding-3-small)
    → write chunk + vector + flat scalar metadata → Chroma
    → write full family record + outbound refs → MongoDB

LINK BUILDING (offline, corpus-wide, no LLM re-runnable)
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
- **Chroma** vector search + per-chunk metadata filtering. Fast for "find things like X" and "find things like X where Y."
- **MongoDB** already the app's datastore (`pymongo`, cause-list parser). Reused here for structured relational facts that need *traversal*, not filtering amendment chains, force-status, and anything closer to a graph than a document.
- **Object storage (Cloudflare R2)** the original source PDF for every ingested document is kept here, keyed so a chunk/citation can link back to it. This is what lets an answer come with "here's the actual PDF page this came from" so a lawyer can verify the source instead of trusting the model's paraphrase.

## Ingestion pipeline

1. **Document intake** judgment PDFs, bare acts/statute text, etc. Parsed with **Docling** (replaces both `pdfplumber` and the earlier PyMuPDF choice). Docling does layout analysis, table-structure recovery and OCR in a single pass and emits **Markdown**, so document structure headings, section numbers, tables survives extraction instead of collapsing into a flat text blob. That structure is load-bearing for the next stage: the chunker splits on it. OCR remains part of intake, since a meaningful share of older Indian judgments and gazetted acts only exist as scans but it runs as a **fallback, not the default pass**: a document is read from its text layer first, and only retried with OCR if that comes back empty. Measured on real SCI judgments, forcing OCR on a text-layer PDF was 50% slower and returned *less* text (35k chars vs 46k) because the OCR pass errored on some pages. Same coverage guarantee, a fraction of the cost and since OCR is the slowest stage, that difference is what makes a 50,000-document run finish. The source PDF is also pushed to object storage (Cloudflare R2) at this stage, keyed for later citation linking.
2. **Structure-aware chunking** chunk boundaries follow meaning/structure (section breaks, paragraph breaks in judgments) rather than fixed token windows, so a chunk doesn't split a clause mid-thought. `chunk_size = 512`, `chunk_overlap = 80`, both in tokens sized from measured paragraph and sentence lengths in this corpus, see the Chunking section below.
3. **Metadata assembly, source-first** the document is routed to one of six families by its manifest `docType`, its S fields are copied from the manifest, its P fields parsed from the text, and an LLM is called only for the family's L fields and only if they are still unfilled. For India Code documents that means no call at all; for a judgment it means one only when the reporter's headings are missing. This is the layer that gives the system facts retrieval can't infer see **Metadata** below for why almost none of them need a model.
4. **Embedding** each chunk embedded with `text-embedding-3-small`.
5. **Storage** chunk text + embedding + per-chunk metadata into Chroma; document-level metadata records and relational facts (amendments, force-status) into MongoDB; source PDFs into Cloudflare R2.

This MongoDB usage is scoped to the RAG pipeline's own data (document records, `statute_relations`). Application-level data user accounts, AI chat history, user projects is a separate concern that also lives in MongoDB (it's already the backend's datastore), but isn't part of this document's design; it doesn't affect the RAG schema below.


## Chunking: sized from the corpus, not from defaults

Chunk size and overlap are the two numbers that quietly set both retrieval quality and most of the vector-store bill, so they are measured against real documents rather than inherited from a tutorial. Token lengths over the judgment bodies in `rag/data/processed/sci/`:

| | median | p75 | p90 | p95 | p99 |
|---|---|---|---|---|---|
| Sentence | 34 | 53 | 79 | 94 | 138 |
| Body paragraph | 95 | 272 | 471 | 531 | 587 |

**`chunk_size = 512` tokens.** The retrievable unit in a judgment is an argumentative paragraph, and p90 of those is 471 tokens a 512-token window keeps ~93% of them whole. The 300 originally sketched here force-splits **23%** of paragraphs mid-argument against 512's **7%**: a 3x increase in precisely the failure this design says it wants to avoid. 512 is also where the curve flattens. A 640 ceiling would split nothing at all in the sample, but that is fitting to three documents, and a 640-token vector is close enough to a full page that it averages several distinct points into one diffuse embedding.

Nothing about 512 is a model constraint `text-embedding-3-small` accepts 8,191 tokens per input, ~16x this. The ceiling is a retrieval-precision choice, and it is affordable here because exact-quote lookup is delegated to the lexical index rather than being asked of the vector store.

**`chunk_overlap = 80` tokens (~16%).** Overlap does exactly one job: stop a boundary forced mid-paragraph from orphaning half a sentence. p90 of sentences in this corpus is 79 tokens, so an 80-token window swallows nine sentences in ten whole. 50 would cover only p75; chasing the long tail (p99 = 138) would buy those rare cases at a price paid on every chunk in the corpus. At 512/80 the stride is 432, so ~19% of tokens get embedded twice inside the standard 10-20% band, and no worse than the 300/50 pairing it replaces.

One refinement, deliberately not built yet: `RecursiveCharacterTextSplitter` applies overlap at *every* boundary, including the ~93% that land cleanly on a paragraph break and need none. Suppressing it on semantic boundaries and keeping it only at forced splits would roughly halve re-embedded tokens. Not worth a custom splitter up front noted for if embedding cost ever becomes the binding constraint.


## Metadata: one schema per document family

Every field below earns its place against one of two jobs: (a) let a filtered/enumerative query work (date, category, section number), or (b) capture a **connection between documents** an act repealed by a newer act, a judgment overruled by a later one. That second job is the whole point of this layer: a flat `"status": "good_law"` string can't answer "overruled by what," only a link to the other document can. If a field does neither job, it isn't here this is not a general-purpose catalog record, it's the minimum the retrieval and hallucination-prevention logic actually needs.

Two things changed from the earlier single-schema sketch, and they are the design:

1. **A judgment, an Act, a Section, a Rule and a Schedule are not the same record.** One flat shape can't hold bench and coram alongside enabling-section and repeal status, and collapsing them is exactly why "show me Criminal acts", "sections of the Motor Vehicles Act" and "judgments after 2023" can't be built as three cheap filters. There are six families below, each with its own fields, and a `document_type` enum that separates them.
2. **Almost none of this needs an LLM.** India Code publishes act linkage, section numbers, ministry, repeal status, related instruments and *amendment history with the operation already classified* through its API they are sitting in `data/raw/india_code/manifest.jsonl` today. The SCR reporter prints a judgment's bench, citation, keywords, cited cases and their treatment under stable headings. Paying a model to re-guess any of that is not just waste; a guess can silently disagree with ground truth and poison the filter and lineage subsystems.

### Provenance: how each field gets filled

Every field carries one tag. This is the load-bearing part of the schema more than the field list itself.

| Tag | Meaning | Cost |
|---|---|---|
| **S** | **Source** the harvest manifest / DSpace API supplies it verbatim | free |
| **P** | **Parsed** deterministic regex or section-heading parse over the document text | free |
| **D** | **Derived** computed from other records (graph inversion, lookup table, date normalization) | free |
| **L** | **LLM** printed nowhere structured; must be read out of prose | paid |

**The rule that makes this enforceable: a field may be tagged L only if it is not obtainable as S or P for that family.** Each family's extraction model binds **only its L fields**, so the model is never shown a field we already know and cannot overwrite one. Where a family's L set is empty five of the six below `extract_metadata()` is not called at all.

This replaces the old "one LLM extraction call per document" cost model. Extraction cost no longer scales with document count; it scales with how much of the corpus arrives *without* structure. See **LLM budget** below for the four calls that survive.

Pipeline/system config which embedding model is active, chunk counts, pipeline version is not document metadata. It's the same for every document and belongs in code/config, not repeated on every record.

### The six families

`document_type` is a **closed enum**, routed from the source's own `docType` by a dict lookup never guessed by a model. `sub_type` keeps the exact source value, so grouping loses nothing.

| `document_type` | Source `docType` | Rows in the 85-doc sample |
|---|---|---|
| `judgment` | SCI / HC (source-implied; no `docType` field) | 13 (separate manifest) |
| `statute_section` | `SECTION` | 45 |
| `statute_instrument` | `ACT`, `ORDINANCE` | 7 |
| `amendment_instrument` | `STATUTE` | 3 |
| `subordinate_legislation` | `RULE` (+ `NOTIFICATION`, `REGULATION` when harvested) | 18 |
| `attachment` | `SCHEDULE`, `ANNEXURE`, `SCHEDULEORDER`, `SCHORDRULE` | 12 |

The four attachment types are grouped because their manifest field coverage is identical but they carry operative text (CPC Order/Rule provisions arrive as `SCHORDRULE`), so `sub_type` plus a citable `provision_label` keeps them findable by number rather than flattening them into "an appendix."

### Core fields (every document, every family)

| Field | Prov. | Fill |
|---|---|---|
| `document_id` | S | India Code `uuid`; SCI `cnr`; ad-hoc upload → content hash |
| `document_type` | S | routed from `docType` by the table above |
| `sub_type` | S | raw `docType` verbatim `SECTION`, `SCHORDRULE`, `SCHEDULEORDER`, … |
| `source` | S | `india_code` \| `sci` \| `upload` |
| `title` | S | manifest `title` |
| `jurisdiction` | S | `CENTRAL` or the state name (`Maharashtra`, `Karnataka`, `Meghalaya`) |
| `language` | S | `en`, unless `regionalTitle` is present |
| `subject_category` | D → L | controlled vocabulary, see below |
| `primary_date` | D | ISO date normalized from whichever date the family owns |
| `source_url` | S | manifest `url` |
| `content_hash` | S | manifest `hash` (SHA-256) the dedup key |
| `storage_ref` | D | R2 object key for the source document |
| `has_text` | S | manifest `hasText` `false` means no text layer |
| `needs_review` | D | set by field validators |

- `document_id` **the identifier the source already assigns**, not a generated slug: the `uuid` on an India Code row, the CNR for a judgment. It is what the ledger, Mongo and Chroma all key on. The readable slugs sketched earlier (`sc_2017_puttaswamy`) are dropped something would have to generate and deduplicate them, and that something would be an LLM inventing primary keys. The live prototype currently uses `uuid.uuid4()` per upload, which means re-uploading the same PDF creates a second disconnected copy; that is a bug against this decision, not an alternative to it.
- `primary_date` one uniform date key across all six families, so `primary_date > "2023-01-01"` is a single filter that works whether the document is a judgment (`judgment_date`), an act (`enact_date`) or a rule (`issued_date`). Each family keeps its own precise date field too; this is the normalized copy the filter subsystem reads. Note India Code returns `enforcementDate` as `DD-MM-YYYY` while `enactDate` is already ISO normalizing is the whole job.
- `storage_ref` the R2 object key for the source document, so an answer can point a lawyer at the actual page. Keys are content-addressed (`raw/<source>/<sha256>.pdf`), which makes upload idempotent across a resumable bulk run. The bucket name is config, not part of the stored reference.
- `has_text` the sample already contains `ANNEXURE` rows with `hasText: false`. Those must land in a review/OCR queue, not be embedded as an empty chunk that retrieval will happily return.
- `needs_review` single flag, set by **validators** (a required S field missing, a date that won't parse, a citation that resolves to nothing), not by asking a model how confident it feels. One flag is enough to route a document to human review; no per-field confidence scores.

**`subject_category` where the cheap-AI trick lives.** Reuse the vocabulary the app already ships in `app/api/lib/data/acts.ts`: Criminal, Civil, Evidence, Constitution, Commercial, Property, Corporate, Consumer, Technology, IP, Tax, Transport, Labour, Family, Public Law, Banking, Regulatory, Environment. Category is a property of the **parent Act**, not of each provision so it is assigned once per `actId` and inherited by every section, rule, schedule and amendment beneath it. Fill order: (1) the `actId` is already in `ACTS_DATASET`; (2) `ministry`/`department` → category lookup table; (3) *only then* one LLM call, for that act. Across 130,580 India Code items that is a few thousand calls at the very worst, not 130,580 and it replaces the free-text `subject_tags` the prototype invents per document, which are unfilterable precisely because no two documents phrase them the same way.

### Family 1 `judgment`

The SCR reporter is already a structured document. Docling's Markdown keeps its headings, and the SCI listing page hands over a semi-structured `listingText` block. Between them, every field here is a section parse or a regex measured against `data/processed/sci/*.md`, whose headings (`## Issue for Consideration`, `## Headnotes †`, `## Case Law Cited`, `## List of Acts`, `## List of Keywords`, `## Case Arising From`) are stable across the sample.

| Field | Prov. | Where it comes from |
|---|---|---|
| `case_name` | P | parties heading / first line of `listingText` |
| `court`, `court_level` | S/D | implied by the source |
| `neutral_citation` | P | `2026 INSC 793` |
| `reporter_citations[]` | P | `[2026] 8 S.C.R. 284` |
| `case_number` | P | `Case No : CIVIL APPEAL No. 14369/2025` |
| `judgment_date` | P | `Decision Date : 04-08-2026` → ISO |
| `bench[]`, `bench_strength` | P | `Coram : SANJAY KAROL*, PRASHANT KUMAR MISHRA` / `Bench : 2 Judges` |
| `authored_by` | P | the `## <Name>, J.` heading; `*` in `Coram` marks the author |
| `issue_for_consideration` | P | `## Issue for Consideration` |
| `headnote` | P | `## Headnotes †` |
| `keywords[]` | P | `## List of Keywords`, `;`-split |
| `acts_referred[]` | P | `## List of Acts`, `;`-split |
| `cites[]` `{raw, type, treatment, document_id}` | P | `## Case Law Cited` |
| `appeal_from` | P | `## Case Arising From` |
| `disposal_note` | P | `Direction Issue :` in `listingText` |
| `precedential_status`, `overruled_by[]`, `affirmed_by[]` | D | Phase B inversion |
| `holding_summary` | **L** | **fallback only** when `## Headnotes` is absent |

- `judgment_date` real date, not just year, since "cases after 2023" needs it; year is derivable from it.
- `keywords` what makes "cases of rape after 2023"-style filtering possible, and it costs nothing: the reporter prints it under `## List of Keywords` as a semicolon-delimited list. This is the per-document topical detail; `subject_category` from the core fields is the coarse bucket that groups the corpus into browsable sections.
- `cites` **parsed, not extracted.** One array for both prior cases (`## Case Law Cited`) and statutes applied (`## List of Acts`), discriminated by `type`. The reporter supplies the treatment itself: entries are semicolon-separated within a group and the group ends `- referred to.`, so the trailing annotation is the whole group's `treatment`. Citations are kept **verbatim** never a generated ID, since asking a model to invent a foreign key produces `constitution_art_21` on one document and `art_21_constitution` on the next, and the two never join.
- `precedential_status` + `overruled_by` / `affirmed_by` **derived, never extracted.** These name *what* overruled or affirmed the case rather than asserting a bare status word, but that information lives in later documents, so it is written by the Phase B pass described below.
- `holding_summary` is the **only** L field in this family, and it fires only when the deterministic parse comes back empty older judgments and High Court output that never went through a reporter. On the SCR corpus it never fires.
- Deliberately left out: parallel citations, per-judge opinion type (majority/dissenting would need the full judgment text to classify correctly, not just front matter), parties as structured entities, case type, procedural status, an LLM-generated headnote (the reporter's own is right there). None of these serve either job above; they're identification detail that can be added later against a concrete need.

### Family 2 `statute_section` (`SECTION`)

The workhorse family: 45 of the 85 sample rows, and the bulk of 130,580 India Code items. **Every field is S or D. The LLM is not called.**

| Field | Prov. | Manifest key |
|---|---|---|
| `act_id`, `act_name`, `act_number`, `act_year` | S | `actId`, `actName`, `actNumber`, `actYear` |
| `section_number`, `section_title` | S | `sectionNumber`, `title` |
| `sequence`, `next_section` | S | `orderNumber`, `nextSection` |
| `ministry`, `department` | S | `ministry`, `department` |
| `page_number` | S | `pageNumber` |
| `repealed`, `act_repealed` | S | `repealed`, `actRepealed` |
| `force_status` | D | computed from the two booleans |
| `amendment_events[]` | S + D | `footnotes[]` |
| `related_instruments[]` `{id, kind}` | S | `linkedIds` |
| `enactment_date` | D | inherited from the parent act record |

- `force_status` `in_force` \| `repealed` \| `act_repealed`, computed from `repealed` and `actRepealed`. **Not inferred.** India Code states it; the earlier design's plan to derive force-status only by inverting citations was solving a problem the source had already solved.
- `amendment_events[]` `footnotes[]` carried over verbatim, one object per event: `{marker, text, operation, amended_by}`, plus a `amended_by_document_id` filled by the resolver. This is section-level amendment history **with the operation already classified by the source** see the lineage section below.
- `related_instruments[]` `linkedIds` with the prefix decoded into a `kind`, so a section links to the rules, notifications and orders made under it without any inference.
- Left out: `handle`, `docId`/`internalId` (duplicates of `uuid` and `sectionId`), `pageFrom`/`pageTo` (zero throughout the sample), `fetchedAt` (crawl bookkeeping, not document metadata).

### Family 3 `statute_instrument` (`ACT`, `ORDINANCE`)

The whole enacted instrument, as opposed to one of its sections. This is the record that owns `subject_category` for everything beneath it.

| Field | Prov. | Notes |
|---|---|---|
| `act_number`, `act_year`, `long_title` | S | `longTitle`: *"An Act to declare and amend the laws to be administered in Oudh."* |
| `enact_date`, `enforcement_date`, `issued_date` | S | `enforcementDate` arrives `DD-MM-YYYY` normalize |
| `chapter_count`, `section_count` | S | structural size; also a completeness check on the section crawl |
| `ministry`, `department`, `repealed` | S | |
| `regional_title` | S | present on regional-language rows |
| `short_title`, `preamble` | P | leading text block |
| `repeals[]` | P | repeal-and-savings clause |
| `amended_by[]` | D | inverted from child `amendment_instrument` rows and section footnotes |

`enact_date` + `force_status` answer "is this in force" the operative question. **L fields: none**; if the `repeals[]` regex misses, the document is flagged for review rather than handed to a model to guess at.

### Family 4 `amendment_instrument` (`STATUTE`)

These rows **are** the amending acts `"The Insolvency and Bankruptcy Code (Amendment) Act, 2018"`, carrying `actId` pointing at the principal Act. The amendment edge is the row itself; nothing needs extracting to find it.

| Field | Prov. | Notes |
|---|---|---|
| `amends_act_id`, `amends_act_name` | S | `actId`, `actName` **the edge, free** |
| `amendment_number`, `amendment_year` | S/P | title + `documentYear` |
| `issued_date`, `last_modified` | S | |
| `commencement_date` | P | commencement clause |
| `affected_sections[]` `{section, operation}` | P → **L** | *"In section 4 of the principal Act…"* |

`affected_sections[]` reuses the same operation vocabulary the footnotes use (`inserted`, `substituted`, `omitted`, `added`, `deleted`) so both sources of amendment fact land in one shape. It is the family's only L field, and only as a fallback when the amendment text is too unstructured to parse.

### Family 5 `subordinate_legislation` (`RULE`, `NOTIFICATION`, `REGULATION`)

| Field | Prov. | Notes |
|---|---|---|
| `parent_act_id`, `parent_act_name`, `parent_act_year` | S | `actId`, `actName`, `actYear` |
| `instrument_title` | S | *"The Companies (cost records and audit) Rules, 2014"* |
| `issued_date` | S | `issuedDate` |
| `repealed` | S | |
| `rule_number` | P | from the title |
| `enabling_section` | P | *"in exercise of the powers conferred by section N"* |
| `gazette_ref` | P | |

`enabling_section` is what closes the loop with `related_instruments[]` on the parent section the section names its rules, the rule names its section. **L fields: none.**

### Family 6 `attachment` (`SCHEDULE`, `ANNEXURE`, `SCHEDULEORDER`, `SCHORDRULE`)

| Field | Prov. | Notes |
|---|---|---|
| `parent_act_id`, `parent_act_name`, `parent_act_year` | S | |
| `attachment_label` | S | `title` `"Schedule I (See Section 2 (o))"`, `"Rule4. Examination of applicant."` |
| `order_number` | S | `orderNumber` |
| `provision_label` | P | normalized citable form `Order X Rule 4` |
| `referred_from` | P | `(See Section 2 (o))` → `section 2(o)` |
| `has_text` | S | `false` on the sample's `ANNEXURE` rows |

`provision_label` is the field that keeps this family useful. `SCHORDRULE` rows are CPC First Schedule Order/Rule provisions *"Order VII Rule 11"* is among the most-cited provisions in Indian civil litigation, and it would be unfindable if these were treated as unnumbered appendices. **L fields: none.**

### LLM budget the complete surviving list

| Call | Frequency | Why it survives |
|---|---|---|
| `subject_category` for an act | once per **act**, only when the lookup misses | nothing structured maps ministry → practice area |
| `holding_summary` for a judgment | fallback, no `## Headnotes` | prose-only fact |
| `affected_sections[]` for an amendment | fallback, unstructured text | prose-only fact |
| classify + extract for an **ad-hoc upload** | once per upload | nothing else knows what the file is |

Everything else is S, P or D. A manifest-backed India Code document makes **zero** LLM calls.

**Two intake lanes**, which is what "only where it's needed" means concretely:

- **Corpus lane** manifest-backed (`india_code`, `sci`), bulk, resumable. Metadata arrives with the document. This is the 50,000-document path the cost plan below is scoped to, and its extraction spend is ~0.
- **Upload lane** the admin UI (`POST /api/v1/rag/ingest`) takes a bare file: no manifest, no source, no type, no act linkage. Here one call to classify into the six-family enum and fill that family's fields is genuinely the only option. It is the **only** per-document LLM call in the system, and it is bounded by how many files an admin uploads by hand. The lane a document came through must be recorded (`source`), because it also sets how much to trust the record.

### Where this data lives

The full record per family is the MongoDB document (source of truth) a `documents` collection, one record per ingested document, keyed by `document_id`.

Chroma per-chunk metadata carries only a **flat scalar subset**, identical across all six families so filters compose:

```
document_id, document_type, sub_type, source, jurisdiction,
subject_category, primary_date (str, ISO), year (int),
act_id, act_year (int), section_number (str), court (str),
force_status, precedential_status, is_current (bool),
chunk_index (int), chunk_heading (str)
```

Two rules on that list. **Every key must be read by at least one planned filter** metadata that no query filters on is dead weight repeated on every chunk. And **every value must be a flat scalar** (str/int/float/bool): arrays and nested objects `bench`, `keywords`, `cites`, `footnotes`/`amendment_events`, `related_instruments` do not go to Chroma, and a retrieved chunk is joined back to its full record in Mongo by `document_id`. This is not a style preference: `Chroma.add_texts` raises `ValueError` on a non-scalar metadata value, so the prototype's `subject_tags: list[str]` fails ingest outright for any document where the model returns a non-empty list.

`chunk_heading` the Markdown heading the chunk sits under is worth its place because the chunker already splits on those headings, so it is free, and it turns a citation from "chunk 7 of this document" into "Section 53(2)".

## Building the connection fields: collect outbound, derive inbound

The connection fields are the reason this metadata layer exists, and inbound links (`overruled_by`, `affirmed_by`, `amended_by`, `repealed_by`) are the one part of the schema no per-document read can fill. They describe what a *later* document did to this one. A judgment does not know it will be overruled; measured across the SCI judgments in `data/processed/sci/`, not one of them contains any marker about its own standing. Anything asked for those fields returns `[]` every time, `precedential_status` defaults to `good_law` for the whole corpus, and the mandatory lineage check below silently passes on everything the safety guarantee resting on a field nothing ever writes.

What a document *does* carry is the **outbound** direction, and this is the part the earlier design got wrong for statutes it is not something to extract at all. India Code publishes it. So the outbound half splits by family:

**Statutes the source supplies the edges (no LLM, no extraction).** Four signals, all verified in the 85-row sample:

1. **`footnotes[]`** section-level amendment history with the operation already classified. 21 footnotes in the sample, 20 carrying `amendedBy`:
   ```json
   {"marker": "1",
    "text": "Sub-section (A-1) was inserted by Mah. 9 of 2021, s. 3(1).",
    "operation": "inserted",
    "amendedBy": "Mah. 9 of 2021"}
   ```
   Observed operations: `substituted` (11), `inserted` (3), `omitted` (3), `added` (1), `deleted` (1), `null` (2).
2. **`docType: "STATUTE"` rows** the amending instruments themselves, each with `actId` naming the principal act. The edge is the row.
3. **`repealed` / `actRepealed`** booleans, direct ground truth for `force_status`. Nothing to infer.
4. **`linkedIds`** the related-instrument graph. The ID prefix gives the kind: `AC_` act, `ST_` statute/amendment, `RU_` rule, `NO_` notification, `OR_` ordinance, `SC_` schedule. The format also embeds the jurisdiction code `AC_CEN_30_42_00009_198859_…` is Central, `AC_MH_…` Maharashtra, `AC_KA_…` Karnataka.

**Judgments parsed from the reporter, still not extracted.** `## Case Law Cited` lists prior authority with its treatment printed at the end of each group (`- referred to.`), and `## List of Acts` lists the statutes applied. Both are section parses over Docling Markdown. Citations are kept **verbatim as printed**, never a generated ID.

```json
"cites": [
  {"raw": "SCG Contracts (India) Pvt Ltd v. K.S. Chamankar Infrastructure Pvt Ltd [2019] 3 SCR 1050 : (2019) 12 SCC 210",
   "type": "case", "treatment": "referred_to", "document_id": null},
  {"raw": "Commercial Courts Act, 2015", "type": "statute", "treatment": "applied", "document_id": null}
]
```

**Phase B resolve and invert, corpus-wide, no LLM.** A deterministic pass over Mongo, re-runnable at any time. Its input is now `cites[].raw` from judgments plus `amendment_events[].amended_by` from section footnotes:

1. **Resolve** normalize each raw string to a `document_id`. Legal citations are highly structured (`(2019) 12 SCC 210`, `Mah. 9 of 2021`, `Section 302 IPC`), so this is regex plus a lookup against `actNumber`/`actYear`/`jurisdiction` already in the corpus a table, not a model call. `"Mah. 9 of 2021"` decomposes to (jurisdiction `Maharashtra`, act number `9`, year `2021`), which is a primary-key lookup. A reference that resolves to nothing keeps `document_id: null` and its raw string a dangling ref, not a dropped one.
2. **Invert** for every resolved edge `A --overrules--> B`, write `A` into `B.overruled_by`. Same shape for `affirmed_by`, `amended_by`, `repealed_by`.
3. **Derive status** `precedential_status` from the inverted edges. `force_status` is *not* inverted: it comes straight from `repealed`/`actRepealed`, with inversion only filling in *what* did the repealing.

Two consequences worth stating plainly. Ingest order stops mattering: a case cited before it is ingested simply stays dangling until the pass runs again and lights it up. And the inbound fields are a **materialized view, not a fact recorded at ingest** they are only as current as the last Phase B run, which is the honest description of what any citator can offer.


## Amendment lineage: a relational layer, not flat metadata

This is the part that's easy to get wrong: bolting `amends`/`amended_by` onto each chunk's metadata as flat fields *looks* right but is the wrong storage shape. Lineage questions are traversal ("what's the current version of this section, and what changed, and when") a fundamentally different access pattern than chunk filtering ("find chunks where date > 2023").

Model it as a small relational structure in MongoDB a `statute_relations` collection keyed by `document_id`, loaded directly from what India Code publishes rather than from anything inferred:

```json
{
  "document_id": "22d029f7-2b84-4c83-a691-89fa4f9f4531",
  "act_id": "AC_MH_166_1512_00001_00001_1618831205912",
  "section_number": "3",
  "in_force": true,
  "amendment_events": [
    {"marker": "1", "operation": "inserted", "amended_by": "Mah. 9 of 2021",
     "amended_by_document_id": null,
     "text": "Sub-section (A-1) was inserted by Mah. 9 of 2021, s. 3(1)."},
    {"marker": "3", "operation": "substituted", "amended_by": "Mah. 7 of 1996",
     "amended_by_document_id": null,
     "text": "These words were substituted for the words \"The Mayor\" by Mah. 7 of 1996, s. 5(b)(i)."}
  ],
  "related_instruments": [
    {"id": "RU_CEN_30_0_00093_1521024033723", "kind": "rule"},
    {"id": "NO_CEN_30_0_00200_1652094603098", "kind": "notification"}
  ],
  "repealed_by": null
}
```

Three things this shape gets that the earlier invented example didn't. Amendment events are **per-event, not a flat list of act IDs**, so "what changed and when" is answerable rather than just "something amended this." The `operation` is the source's own classification, not a guess. And `amended_by_document_id` sits alongside `amended_by` rather than replacing it, so an unresolved reference degrades to a readable citation instead of disappearing.

Chunk metadata in Chroma carries a denormalized `force_status` / `is_current` flag for cheap filtering, but this layer is the source of truth, and any lineage question traverses it directly rather than trying to reconstruct history from scattered chunk fields.

## Retrieval: three subsystems, not one

| Subsystem | Backs | Query shape | Filter keys it uses |
|---|---|---|---|
| **Semantic** (Chroma vector search) | Conceptual/topical questions | "what does the law say about X" | |
| **Structured filter** (Chroma metadata / Mongo query) | Enumerative questions | "cases after 2023", "all sections of the MV Act", "Criminal acts" | `document_type`, `sub_type`, `primary_date`/`year`, `subject_category`, `jurisdiction`, `act_id`, `court` |
| **Lexical / exact-match** (full-text index) | Direct quotes, exact clause lookup | "quote me Section 302" | `act_id` + `section_number` narrow before the text match |
| **Lineage traversal** (Mongo `statute_relations`) | Amendment/force-status questions | "is this still law", "what amended this" | `force_status`, `is_current` for the cheap pre-check |

That `document_type` column is what the six families buy: "judgments after 2023" is `document_type = judgment` plus a date bound, and "the rules under the Companies Act" is `document_type = subordinate_legislation` plus `act_id` two scalar filters each, no semantic search involved, and the same keys drive separate Judgments / Acts / Rules sections in the app.

Note: Chroma alone doesn't serve exact-match well semantic similarity will surface a *close* chunk, not the *exact* one. This needs a lexical index alongside the vector store (Mongo text index, or a BM25 layer) flagged as an open build item, not yet decided.

Lineage traversal isn't really a "retriever" in the RAG sense it's a lookup against the relational layer above, but it's listed here because the agentic router treats it as one of the tools it can reach for.

## Agentic decision engine

```
query
  → classify query type (semantic / filter / exact-quote / lineage can be more than one)
  → route to matching subsystem(s), optionally combined
      (e.g. semantic search *filtered* by date/category)
  → mandatory lineage/force-status check on anything the answer would cite
  → synthesize answer with citations back to source chunk + document
```

**Design choice: classify up front, don't fall back.** The alternative try semantic search first, fall back to other subsystems if it looks insufficient is simpler to build but risks silently answering from the wrong subsystem instead of admitting no direct match. Given how costly a confident-but-wrong legal answer is, upfront classification is the safer default here.

## Hallucination mitigation, as system-level rules

- Every answer must ground back to a retrieved chunk with a citation. No supporting chunk → say so, don't answer from parametric knowledge.
- Any statute/section cited in an answer must pass the lineage/force-status check before being surfaced never present an amended/repealed provision as current without saying so.
- Low-confidence metadata extractions are flagged for review, not silently defaulted, since bad metadata poisons the structured-filter and lineage subsystems silently.

## Open questions (not resolved yet)

- ~~Chunking specifics~~ resolved above (see **Chunking: sized from the corpus**): `chunk_size = 512`, `chunk_overlap = 80`, measured in tokens against real judgment paragraph and sentence lengths rather than assumed. Worth re-measuring once bare acts and High Court judgments are in the corpus the numbers come from SCI judgment bodies, which is the hardest case but not the only one.
- ~~Data sourcing for lineage~~ **resolved: the source publishes it.** India Code returns `repealed`/`actRepealed` as booleans, per-section `footnotes[]` with the amending act and the operation already classified, `docType: "STATUTE"` rows as the amending instruments, and `linkedIds` as the related-instrument graph. Force-status is read, not inferred. What remains is **coverage at scale**, below.
- **Lineage coverage at full corpus scale** the four signals above are verified on 85 rows. Open: what fraction of the 130,580 items carry non-empty `footnotes[]`, and how complete `linkedIds` is (empty on most sample rows 10 links across 85 documents, all from a single section). If `linkedIds` is sparse in general, the related-instrument graph is thin even though the mechanism is free. Measure on the Phase 0 pilot.
- **Citation resolver coverage** what fraction of judgment `cites[].raw` strings and footnote `amended_by` strings actually resolve to a `document_id`? Unmeasurable until the pilot; if it is low, the lineage subsystem is thin no matter how correct the mechanism is. Worth reporting as a pilot metric alongside cost. Note the two halves differ in difficulty: `"Mah. 9 of 2021"` decomposes to a primary-key lookup, while a case citation string does not.
- **`subject_category` map coverage** how many distinct `actId`s does the corpus contain, and what share are covered by `ACTS_DATASET` plus a ministry/department lookup before falling through to an LLM call? That share is the entire extraction bill for the statute corpus, so it is the number to measure first.
- **Documents with no text layer** the sample already contains `ANNEXURE` rows with `hasText: false`. They must not be embedded as empty chunks. Open: OCR them, or hold them as metadata-only records that a search can surface but not quote from.
- **`SCHORDRULE` provision labels** CPC Order/Rule provisions arrive with titles like `"Rule4. Examination of applicant."` and an `orderNumber`, but the Order number itself is not a manifest field. Deriving a citable `Order X Rule Y` label may need the parent Schedule's structure, which the current crawl does not capture.
- **Query-time cost is unbudgeted** the ₹5,000 cap covers ingestion only. Every user question costs a router call plus a synthesis call carrying ~10 chunks x 512 tokens. That is the *recurring* bill, and the one that scales with usage rather than corpus size; it needs its own number before launch.
- **Chunk-level dedup conflicts with citation linking** cost lever #5 below proposes deduping identical chunks across documents, but a shared chunk can carry only one `document_id` / `storage_ref`, so an answer citing it would point a lawyer at the wrong PDF. Document-level dedup (content hash, already in `ledger.py`) is safe; chunk-level needs either a chunk-to-documents back-reference or dropping the lever.
- **Re-ingestion/versioning** when a statute is amended, does it get a new chunk version (old text kept, marked historical) or mutated in place? Historical versions matter for cases decided under old law.
- **Lexical index choice** Mongo text index vs. a dedicated BM25 layer, for the exact-quote subsystem.
- **Chroma deployment model** local/persistent client vs. a hosted Chroma instance not decided. The sizing that should decide it: at 512/80, judgments of this length yield ~20 chunks each, so 50,000 documents is ~1M vectors, and `text-embedding-3-small` at its default 1,536 dimensions is 6 KB per vector **~6 GB** of raw floats before Chroma's own index overhead. (The old 300/50 pairing would have been ~35 chunks/doc, ~10 GB.) If that is too large for the chosen deployment, `text-embedding-3-small` supports the `dimensions` parameter (Matryoshka truncation): 768 or 512 dimensions halves or quarters the footprint at some recall cost. Measure that on the Phase 0 pilot rather than guessing.
- ~~Chroma vs. Mongo boundary~~ resolved above: full record in Mongo, flattened scalar subset denormalized to Chroma per-chunk metadata for filtering.
- ~~OCR engine~~ resolved: Docling handles it in-pipeline. What is still unmeasured is OCR *throughput* on this corpus it is by far the slowest stage, and 50,000 documents makes that a scheduling question (see the Phase 0 pilot).

## Locked decisions

- First corpus: **India Code** (Central and State acts, sections, rules, attachments) - `statute_section` and lineage are what v1 exercises; judgments follow
- Document identity: **the source-assigned ID** (India Code `uuid` / SCI CNR), never an LLM-generated slug and never a per-upload `uuid4()`
- **`document_type` is a closed six-value enum** (`judgment`, `statute_section`, `statute_instrument`, `amendment_instrument`, `subordinate_legislation`, `attachment`), routed from the source's `docType` by a dict; `sub_type` preserves the exact source value. Never a model's free-text guess
- **One metadata schema per family**, sharing a core record - not one flat schema for every document
- **Field provenance is part of the schema.** Every field is tagged S (source) / P (parsed) / D (derived) / L (LLM), and **a field may be tagged L only if it is not obtainable as S or P for that family**. Extraction models bind only the L fields, so a manifest-backed document makes zero LLM calls
- **Source-first**: never ask a model for a fact the manifest already supplies. India Code's `repealed`/`actRepealed`, `footnotes[]`, `linkedIds` and act linkage are ground truth, not hints to be re-derived
- Topical classification: a **closed vocabulary** reused from `app/api/lib/data/acts.ts`, assigned **once per act** and inherited by its provisions - not free-text tags invented per document
- Citation references: kept **verbatim as raw strings**, resolved to `document_id` by a separate deterministic pass
- Connection fields: **outbound collected (from source for statutes, parsed for judgments), inbound derived** by a re-runnable non-LLM inversion pass
- Chroma per-chunk metadata: a **flat scalar subset only**, uniform across families; arrays and nested objects live in Mongo and are joined by `document_id`
- Vector store: **Chroma**
- Embeddings: **OpenAI `text-embedding-3-small`** 1,536 dimensions by default, 8,191-token input limit; the `dimensions` parameter is held in reserve as a storage lever, not used by default
- Chunking: **`chunk_size = 512` / `chunk_overlap = 80`**, measured in tokens via a `tiktoken` length function, splitting on Docling's Markdown headings first sized from this corpus, see the Chunking section
- Agentic LLM calls (extraction, routing, synthesis): **OpenAI**
- Relational/lineage store: **MongoDB** (reusing the backend's existing datastore)
- PDF text extraction: **Docling** (Markdown output, layout + table structure preserved)
- OCR for scanned/no-text-layer documents: handled inside Docling, triggered as a **fallback** when a document's text layer comes back empty never forced on every document
- Docling layout model runs on **ONNX Runtime**, not torch: the torch engine segfaults on Windows/CPU (reproducible with Docling's own CLI). Configurable via `RAG_DOCLING_LAYOUT_ENGINE`
- Source document storage: **Cloudflare R2**, content-addressed at `raw/<source>/<sha256>.pdf`, linked back from citations so answers can point to the original PDF
- Content-hash dedup: **LMDB** (`rag/data/hash_index.lmdb`, `rag/hash_db.py`) O(1) `exists`/`put`/`get`/`delete` against an on-disk B-tree, so memory stays flat regardless of corpus size; nothing is preloaded into RAM at startup. Backed up to Cloudflare R2 (content-addressed alongside the source PDFs) after each new entry, throttled so a bulk run doesn't re-upload a full snapshot per document. Supersedes the SQLite-ledger dedup plan below for the hash-lookup piece specifically.
- Ingest bookkeeping: **SQLite** (`rag/data/ledger.sqlite3`) per-document pipeline status (parsed/chunked/embedded/stored), so a 50,000-document run is resumable. Local batch state only; it is not application data and does not belong in Mongo. Not yet rebuilt dedup now lives in the LMDB index above instead of here

## Cost-controlled bulk ingestion (50,000 documents, target ≤ ₹5,000)

Target: ingest ~50,000 documents (parse → chunk → metadata extraction → embed) for **≤ ₹5,000 total AI spend** (embeddings + LLM metadata calls; excludes document acquisition and self-hosted OCR compute, neither of which are per-call API costs). At that volume, the budget is roughly **$0.0012/document** workable, but only if the cost levers below are actually pulled, not left as defaults.

### The levers, ranked by impact

0. **Don't call the model at all.** This lever came later than the rest and dominates every one below it, because it doesn't reduce the price of extraction it removes extraction. India Code publishes act linkage, section numbers, ministry, dates, repeal status, related instruments and per-section amendment history through its API, and the SCR reporter prints a judgment's bench, citations, keywords and cited authority under stable headings. Under the provenance rule in the Metadata section, a manifest-backed document makes **zero** LLM calls; what survives is one classification per *act* (not per document) plus prose-only fallbacks. Levers 1-3 below still apply, but to a call volume that is now a rounding error against 50,000 documents.
1. **Cheap model tier for whatever extraction survives.** Metadata extraction is a bounded structured-output task reading a page or two of front matter it does not need a frontier model. Use the cheapest tier capable of reliable structured JSON output (mini/nano class). Chat-completion pricing per token runs far above embedding pricing, so an oversized model here dominates whatever extraction remains.
2. **Truncate input, always.** The extraction call gets front matter only (first ~1-2 pages / ~1,000 tokens) never the full document body. Input token count must be capped by design, not by hoping documents are short.
3. **Batch API for both calls.** Neither embedding nor metadata extraction needs a live response this is a one-time bulk job with no latency requirement. OpenAI's Batch API runs at roughly half the synchronous price for both endpoints. Skipping this doubles the bill for no reason.
4. **Never more than one LLM call per document, and usually none.** Already the design (see Metadata section above) extraction cost scales with how much of the corpus arrives *unstructured*, chunking/embedding cost scales with chunk count. Don't let the two get conflated, and don't let a per-chunk call in anywhere. This also rules out `SemanticChunker`, which embeds every sentence to find its own split points and then hands chunks to Chroma to be embedded a second time two full embedding passes per document, for a boundary decision the Markdown headings already make. The prototype in `rag/app/ingest/splitter.py` currently does exactly this; see `TODO.md`.
5. **Dedup before spending.** The same statute section gets cited verbatim across many judgments. Hash the extracted text before chunking/embedding/extracting; if a chunk's content has already been processed under another document, link to the existing record instead of paying to re-embed and re-extract identical text.
6. **Self-hosted OCR.** A paid cloud OCR API charges per page and isn't part of the "AI cost" the ₹5,000 figure is scoped to, but it's real money on top if used. Run OCR locally (e.g. Tesseract) for the scanned-document share of the corpus instead.

### Phase 0 Calibrate before committing spend (do this first)

Run the full pipeline end-to-end on a random sample of ~300-500 documents, chosen to represent the actual mix (short orders, long judgments, statute sections, some scans). Measure the real numbers this plan is currently estimating: average tokens/doc into the embedding step (post-chunking, post-overlap), average input/output tokens for the extraction call, and actual dollars spent on that sample via the billing dashboard. Multiply up to 50,000 and compare against the ₹5,000 cap.

This step exists because the estimate above (~$20-40) is built from generic per-token rates, not this specific corpus real Indian judgments may run longer or shorter, front matter may need more or less context than assumed, and pricing may have moved since. Don't submit the full 50k-document batch until the pilot's real per-document cost is known and confirmed to fit with margin.

### Phase 1 Hard spend cap, not just an estimate

However good the pilot numbers look, don't rely on a single upfront calculation for a 50,000-document commitment. Track cumulative spend (tokens processed × known rate) as batches complete, and process in tranches (e.g. 5,000-10,000 documents at a time) rather than submitting all 50,000 at once a bad calibration then costs 10-20% of budget to discover, not 100%. Halt automatically if projected total spend crosses a safety threshold (e.g. 80% of the ₹5,000 cap) before the remaining tranches run.

### Phase 2 Execution order

1. Stage the 50,000 source documents (acquisition/scraping is a separate concern from this budget flagged, not covered here).
2. Dedup by content hash before any paid processing.
3. Run the Phase 0 pilot; confirm real cost/document fits the cap with margin.
4. Submit remaining documents in tranches via the Batch API (both extraction and embedding calls), tracking cumulative spend against the Phase 1 cap between tranches.
5. Reconcile actual total spend against the ₹5,000 target once all tranches complete.
