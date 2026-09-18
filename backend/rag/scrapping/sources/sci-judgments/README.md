# Supreme Court of India reported judgments

Source: <https://scr.sci.gov.in/scrsearch/> (Supreme Court Reports search).

Unlike `../india-code/`, this site has **no usable API and an active bot
defence**. Plain HTTP calls are blocked even with correct session cookies a
WAF/fingerprint check that a real browser engine passes and a bare HTTP client
does not. So this source drives a real Chromium via Playwright, and a human
solves the CAPTCHA inside the automated window.

That is the design, not a stopgap: no CAPTCHA-solving service, no challenge
circumvention. A person clears it; the tool works inside that session.

## Usage

```bash
# Inspect the results page dumps tables and saves HTML for selector work.
npm run scrape:sci:inspect

# Download N new judgment PDFs (default 2).
npm run scrape:sci:download -- 25
```

Both open a browser window and wait. Solve the CAPTCHA and run a real search;
`download.ts` watches the results table and takes over as soon as rows appear
(no terminal interaction needed, so it can also be launched from the admin
panel's "SC Judgment Scraper" tab, which runs it as a child process). If
nobody solves the CAPTCHA, `download.ts` gives up after
`SCRAPE_SOLVE_TIMEOUT_MS` (default 15 minutes, PRODUCTION_TODO.md T12) and
exits cleanly rather than holding the browser open forever.

Both need a real Chromium window, which a VPS with no display cannot open —
`../../../deploy/scrape-session.sh` gives it a virtual one and a way to watch
it over an SSH tunnel; see `deploy/README.md`'s Scraping section.

## The one non-obvious mechanic

Clicking "PDF" downloads nothing. It swaps the real PDF into an
`<object data="...">` inside an already-present viewer panel, which Chrome then
renders inline. `download.ts` waits for that attribute to change, then fetches
the URL directly rather than fighting Chrome's built-in PDF viewer for its
download button. The modal's backdrop also covers the page, so the script waits
for it to actually disappear before touching the next row.

## Output

`../../data/raw/sci/` PDFs named by CNR, with `manifest.jsonl` carrying the
CNR, title, and the listing-page text (which holds the coram, decision date,
case number and headnote summary, all worth keeping).

Each PDF is also copied into `INBOX_ROOT/sci/` as it downloads, the same drop
directory a manual bulk import uses and the same court-hint convention
`ingest_worker.py` reads from a top-level subdirectory name, so it lands in
the knowledge base without a separate batch step (PRODUCTION_TODO.md T11: the
scraper never calls the serving API directly -- `owllex-ingest.service` drains
the inbox on its own schedule, so a slow OCR run never blocks a user query).
Never fatal: if the inbox isn't writable, queueing is skipped with a warning
and the PDF is still downloaded and kept in `../../data/raw/sci/` for a manual
retry.

## Files

| File | Responsibility |
|---|---|
| `download.ts` | The scraper: paginate results, download PDFs, dedup, write manifest |
| `inspect.ts` | One-off page inspector use when selectors break |
