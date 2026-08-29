# Supreme Court of India — reported judgments

Source: <https://scr.sci.gov.in/scrsearch/> (Supreme Court Reports search).

Unlike `../india-code/`, this site has **no usable API and an active bot
defence**. Plain HTTP calls are blocked even with correct session cookies — a
WAF/fingerprint check that a real browser engine passes and a bare HTTP client
does not. So this source drives a real Chromium via Playwright, and a human
solves the CAPTCHA inside the automated window.

That is the design, not a stopgap: no CAPTCHA-solving service, no challenge
circumvention. A person clears it; the tool works inside that session.

## Usage

```bash
# Inspect the results page — dumps tables and saves HTML for selector work.
npm run scrape:sci:inspect

# Download N new judgment PDFs (default 2).
npm run scrape:sci:download -- 25
```

Both open a browser window and wait. Solve the CAPTCHA, run a real search, and
press Enter in the terminal once results are on screen.

## The one non-obvious mechanic

Clicking "PDF" downloads nothing. It swaps the real PDF into an
`<object data="...">` inside an already-present viewer panel, which Chrome then
renders inline. `download.ts` waits for that attribute to change, then fetches
the URL directly — rather than fighting Chrome's built-in PDF viewer for its
download button. The modal's backdrop also covers the page, so the script waits
for it to actually disappear before touching the next row.

## Output

`../../data/raw/sci/` — PDFs named by CNR, with `manifest.jsonl` carrying the
CNR, title, and the listing-page text (which holds the coram, decision date,
case number and headnote summary, all worth keeping).

```bash
cd backend && python -m rag.ingest --source sci
```

## Files

| File | Responsibility |
|---|---|
| `download.ts` | The scraper: paginate results, download PDFs, dedup, write manifest |
| `inspect.ts` | One-off page inspector — use when selectors break |
