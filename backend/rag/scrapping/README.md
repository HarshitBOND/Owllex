# Ravenslaw Scrapping Court & Statute Document Acquisition

Stages Indian legal documents on disk as input to the RAG ingestion pipeline
(`../ARCHITECTURE.md`). This module's only job is to get files onto disk safely
and record what it got; everything downstream R2 upload, text extraction,
chunking, embeddings belongs to `rag/ingest.py` and reads from the manifests
written here.

## Layout

Shared machinery in `core/`, one directory per source in `sources/`. A source
directory owns everything specific to that site and nothing else; when a court
site changes its markup, exactly one directory changes.

```
scrapping/
  core/                       shared, source-agnostic
    http.ts                   polite client: serialised, paced, backoff on 5xx
    manifest.ts               JSONL manifest resumability + dedup
    paths.ts                  on-disk layout (mirrors rag/config.py)
    prompt.ts                 wait-for-Enter, for human-in-the-loop CAPTCHAs
  sources/
    india-code/               statutes DSpace REST API, no CAPTCHA
      dspace.ts               typed API client
      metadata.ts             dc.* → normalised record
      harvest.ts              CLI entry point
    sci-judgments/            Supreme Court Playwright, human-solved CAPTCHA
      download.ts             CLI entry point
      inspect.ts              one-off page inspector for selector work
    hc-judgments/             High Courts see that directory's README
  data/raw/<source>/          output (gitignored)
    manifest.jsonl
    pdfs/
```

## Adding a source

1. `mkdir sources/<name>/` with a `README.md` saying what the site is and how it
   fights back.
2. Write an entry point that builds a `PoliteClient` and a `Manifest`, and
   appends one row per document as it lands never in a batch at the end.
3. Add an `npm run scrape:<name>` script in the root `package.json`.

Reuse `core/` rather than reimplementing pacing or dedup. The two failure modes
it exists to absorb a source that intermittently 502s, and a crawl that gets
killed halfway are universal, not per-site.

## The manifest contract

Every source writes `data/raw/<source>/manifest.jsonl`, one JSON object per
document. This is the handoff to Python, and `rag/ingest.py` requires:

| Field      | Required | Meaning                                                  |
|------------|----------|----------------------------------------------------------|
| `filename` | yes      | Basename inside `<source>/pdfs/`                          |
| `hash`     | yes      | SHA-256 of stored bytes the dedup key                   |
| `cnr`      | no       | Stable source id; the ingester falls back to filename stem |

Anything else on a row is source-specific metadata carried along for later use.
Ingest a source with:

```bash
cd backend && python -m rag.ingest --source india_code
```

Rows are appended as documents land. Killing a crawl loses at most the row in
flight; re-running resumes.

## Dedup: the LMDB hash index

Sources no longer read `manifest.jsonl` into a Set at startup that parsed the
whole file before the first download and held every hash in RAM, which does not
survive the 50,000-document target. Dedup now goes through `hashdb.ts`, an LMDB
index at `SCRAPE_LMDB_PATH` (default `<DATA_ROOT>/lmdb/scrapping_hashdb`):
startup is constant, memory is constant, and a lookup is a single B-tree probe.

The shape in a source is, roughly (see `sources/sci-judgments/persist.ts` for
the real, crash-safe version and why the ordering matters):

```ts
if (!has(`sci:cnr:${cnr}`)) {
  // ...download, write the file, append the manifest row...
  await put(`sci:hash:${hash}`, cnr);
  await put(`sci:cnr:${cnr}`, 1); // last -- only once everything above landed
}
```

Keys are namespaced by source (`sci:cnr:`, `sci:hash:`, `india_code:<docKey>`).
The manifest is still written it remains the handoff to Python it is just no
longer the thing consulted to decide what to skip.

This index means "downloaded" and is deliberately **not** the same database as
`rag/core/hash_index.py`, which means "ingested"; sharing them would make the
ingest pipeline skip every document the scraper had just fetched.

`backupHashIndex()` snapshots the index to `<BACKUP_ROOT>/scrapping/` (local
disk, not R2 -- R2 was removed, see `backend/MIGRATION.md`), throttled to one
snapshot per `HASH_DB_BACKUP_INTERVAL_SECONDS` (default 300) so a bulk run does
not re-snapshot per document, plus a forced snapshot at the end of every run.

### Reading this index from Python

`backend/rag/scripts/audit_scrape_index.py` reconciles `<source>:cnr:*` keys
against `manifest.jsonl` and reports (or, with `--fix`, deletes) orphans -- a
CNR marked downloaded with no manifest row for it, which without a fix means
it will never be re-fetched (PRODUCTION_TODO.md T3).

The npm `lmdb` package defaults to an on-disk data format (V2) that Python's
`lmdb` binding cannot open at all (`lmdb.InvalidError: ... File is not an LMDB
file`). Before running the audit script against a real index, rebuild the
native module in the legacy, cross-compatible V1 format on whichever machine
actually runs the scraper:

```bash
npm run scrape:setup-lmdb-v1   # cd node_modules/lmdb && LMDB_DATA_V1=true node-gyp rebuild
```

This is a one-time build step for that machine, not something wired into
`npm install` for the whole project -- the scraper and this audit script run
wherever scraping happens, not in the Vercel build, and forcing every install
everywhere to compile a native module from source is a bigger call than one
task's scope. There is no in-place converter between the two formats: an index
already written in V2 has to be re-scraped after rebuilding.

One-time backfill from manifests written before this existed:

```bash
cd backend/rag/scrapping && npx tsx migrate-manifests.ts
```

## Sources

| Source | Site | Access | Volume |
|---|---|---|---|
| `india-code` | indiacode.gov.in | Public DSpace 9.1 REST API | 130,580 items |
| `sci-judgments` | scr.sci.gov.in | Playwright + human-solved CAPTCHA | incremental |
| `hc-judgments` | per-court | not built see its README | |

## On CAPTCHAs

Some sources sit behind a CAPTCHA or bot challenge. The approach here is
deliberately **not** to solve or automate past one: a human opens the browser,
clears the challenge, and the tool works inside that session
(`sources/sci-judgments/download.ts`). Keep it that way don't reach for a
CAPTCHA-solving service without treating it as a real decision rather than a
drop-in upgrade.

India Code needs none of this. It has a public REST API, which is why its
harvester is a plain HTTP client and runs unattended.

## Legal notes

Not legal advice, but these are load-bearing to the design:

- Statutes and judgments are public records the premise the whole effort rests
  on, and what Indian Kanoon, SCC Online and Manupatra already operate on.
- Keep request rates modest and keep the `contact` in `core/http.ts` pointing at
  a real address, so an operator can email us rather than just blocking us.
- `PoliteClient` backing off instead of hammering is scraping etiquette, and
  avoids degrading a government site for the humans who need it. Don't "fix" a
  slow crawl by removing the delay.

## Known dead weight

`backend/tests/test_scrapping.py` is a spec for a recipe-driven Python scraper
(`curl_import.py`, `models.py`, `store.py`, ...) that was **never built** the
suite fails at import with `ModuleNotFoundError`. The working scrapers are the
TypeScript ones documented above. That file should either be deleted or kept as
a design note under a name that doesn't look like a live test; it is currently
neither passing nor testing anything that exists.
