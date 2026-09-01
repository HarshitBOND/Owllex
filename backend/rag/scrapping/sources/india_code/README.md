# India Code acts, their sections/rules/schedules, and PDFs

Source: <https://indiacode.gov.in/> an Angular SPA over a **DSpace 9.1 REST
API**. Unlike `../sci-judgments/`, there is no CAPTCHA and nothing to solve by
hand; this runs unattended.

## Two things that will waste your afternoon

1. **Use `https://indiacode.gov.in` no `www`.** The app is served from
   `www.indiacode.gov.in` but its API lives on the bare domain, and the CORS
   preflight from `www` is refused. Every deep page loaded via `www` renders a
   "500 Service unavailable" that has nothing to do with the server being down.
2. **`indiacode.nic.in` is 403 at the Akamai edge** for anything that isn't a
   browser. `curl` gets `Access Denied`; so does headless Chromium on that host.

Playwright still drives a real Chromium, but only to *establish the session* —
the site hands out cookies and a CSRF token on first load, and `context.request`
inherits them. Everything after that is the same JSON the page itself fetches.

## Why the API and not the DOM

The act listing is client-rendered ten rows at a time and every section link is
`href="javascript:void(0)"`, so the DOM carries strictly less than the payload
behind it. The API also gives fields the page never shows (`linked_id`,
`order_number`, `page_number`, the raw footnote markup).

**No AI is needed for metadata.** `dc.*` already carries act number, year,
ministry, department, section number and ordering; amendment footnotes come
through as marked-up text that `parseFootnotes` turns into
`{marker, text, operation, amendedBy}` with plain regexes including resolving
`ibid` back to the act named in the previous footnote.

## The three calls that matter

Everything the act page shows reduces to these:

| What | Call |
|---|---|
| Acts in a jurisdiction | `/discover/search/objects?configuration=collection&scope=<Acts collection uuid>` |
| An act's child doc types (its tabs) | `/discover/facets/identifier_collection?query=dc.identifier.act_id:<ACT_ID>` |
| The children of one type | `/discover/search/objects?f.identifier_collection=SECTION,equals&f.act_id=<ACT_ID>,equals` |

Add `&embed=bundles/bitstreams` and the PDF URLs come back in the same response
— one call per 100 documents instead of one per document. Amendments are a
separate query by act number + year, scoped to the "All Amendments" collection.

Every jurisdiction is a community (`CENTRAL`, `Maharashtra`, …) holding one
collection per document type: `Acts`, `Rule`, `Section`, `Schedule`, `Ordinance`,
`Notification`, and so on. Children find their parent through
`dc.identifier.act_id`.

## Usage

```bash
cd backend/rag/scrapping/sources/india_code

# 5 most recent central acts, with every child document and PDF
npx tsx download.ts --acts 5

# one specific act, sections only, no PDFs
npx tsx download.ts --acts 1 --search "Motor Vehicles Act 1988" --types SECTION --skip-pdf

# a state
npx tsx download.ts --jurisdiction Maharashtra --acts 20

# print an act's live API shape -- use this when something stops parsing
npx tsx inspect.ts "Motor Vehicles Act 1988"
```

| Flag | Meaning |
|---|---|
| `--jurisdiction` | Community name, default `CENTRAL`. Bad values print the valid list. |
| `--acts` | How many acts to walk, default 5. Newest first unless `--search` is given. |
| `--search` | Only acts matching this text, best match first. |
| `--types` | Restrict child types, e.g. `SECTION,RULE`. Default: everything the facet reports. |
| `--skip-pdf` | Metadata and text only. |

## Dedup: hash the leaves, never the act

This is the part to not "simplify" later. Dedup is keyed **per leaf document**
(`SECTION:28326`, `BITSTREAM:<uuid>`, …) and stored as the SHA-256 of the bytes
actually written.

Acts are deliberately **never** used as a skip key. An act you already hold can
still gain an amended section next month, so every run re-walks every act it is
asked for and lets each child's own hash decide. Hashing the act as one blob
would make an amendment invisible.

On a re-run: unchanged children are skipped with no write; a child whose text
changed is rewritten and gets a **fresh manifest row**, so the manifest is a log
and the newest row for a `docKey` is the current one. `rag/ingest.py` sees the
new hash and re-embeds just that document.

## Output

`../../data/raw/india_code/`

| File | What |
|---|---|
| `act_<year>_<uuid8>.json` | The act record metadata, preamble, amendment list |
| `act_<year>_<uuid8>.pdf` | Act PDFs from the ORIGINAL bundle (`_2` suffix for the Hindi copy) |
| `section_<year>_s<num>_<uuid8>.txt` | Section text plus its footnotes |
| `rule_<year>_<uuid8>.txt` / `.pdf` | Rules, schedules, notifications, … same shape |

```bash
cd backend && python -m rag.ingest --source india_code
```

## Files

| File | Responsibility |
|---|---|
| `download.ts` | The scraper: walk acts, their children and amendments, download PDFs, dedup, write manifest |
| `inspect.ts` | Prints an act's live API shape every `dc.*` field, child types, bitstreams, amendments |
