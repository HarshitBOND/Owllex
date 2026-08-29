// Downloads Supreme Court judgment PDFs from the SCR search site.
//
// Drives a REAL Chromium (via Playwright) because scr.sci.gov.in blocks plain
// HTTP calls even with correct session cookies. Solve the captcha and run a
// search yourself in the automated window; this script takes over once
// results are on screen, and reuses that browser session for the PDF fetches.
//
// Run with:
//     npm run scrape:sci:download -- 25

import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SEARCH_URL = "https://scr.sci.gov.in/scrsearch/";
const N = Number(process.argv[2]) || 2; // how many new PDFs to download

const SOURCE = "sci";
const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = join(__dirname, "..", "..", "data", "raw", SOURCE);
const PDF_DIR = join(SOURCE_DIR, "pdfs");
const MANIFEST_PATH = join(SOURCE_DIR, "manifest.jsonl");

async function waitForEnter(message: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(message);
  rl.close();
}

async function main(): Promise<void> {
  mkdirSync(PDF_DIR, { recursive: true });

  const seenHashes = new Set<string>();
  const seenCnrs = new Set<string>();
  if (existsSync(MANIFEST_PATH)) {
    for (const line of readFileSync(MANIFEST_PATH, "utf-8").split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      seenHashes.add(row.hash);
      if (row.cnr) seenCnrs.add(row.cnr);
    }
  }

  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    await page.goto(SEARCH_URL);

    console.log("Solve the captcha and run a search, then come back here.");
    await waitForEnter("Press Enter when the results are showing... ");

    let downloaded = 0;

    while (downloaded < N) {
      const rows = page.locator("#report_body tr");
      const total = await rows.count();
      if (total === 0) break;

      for (let i = 0; i < total && downloaded < N; i++) {
        const row = rows.nth(i);

        const cnrInput = row.locator("input#cnr").first();
        if ((await cnrInput.count()) === 0) continue; // header/"no records" rows carry no cnr input

        const cnr = await cnrInput.getAttribute("value");
        if (!cnr || seenCnrs.has(cnr)) continue;

        const title =
          (await row.locator("button[aria-label]").first().getAttribute("aria-label").catch(() => null))?.trim() ??
          null;
        const listingText = await row.innerText();

        let buffer: Buffer | null = null;
        try {
          const viewer = page.locator("#viewFiles-body object");
          const previousSrc = await viewer.getAttribute("data").catch(() => null);

          // clicking PDF swaps the real PDF into the <object data="..."> instead of
          // downloading it -- wait for that attribute to change, then fetch it directly
          await row.locator("a:has(i.fa-file-pdf)").first().click();
          await page.waitForFunction(
            (prev) => {
              const src = document.querySelector("#viewFiles-body object")?.getAttribute("data");
              return !!src && src !== prev;
            },
            previousSrc,
            { timeout: 30_000 },
          );

          const relativeUrl = await viewer.getAttribute("data");
          const pdfUrl = relativeUrl ? new URL(relativeUrl, page.url()).toString() : null;

          if (pdfUrl) {
            const response = await context.request.get(pdfUrl);
            if (!response.ok()) {
              console.warn(`  fetch failed (HTTP ${response.status()}): ${pdfUrl}`);
            } else {
              const body = await response.body();
              // a blocked/expired session hands back an HTML page with a 200, so check magic bytes
              if (body.subarray(0, 4).toString("latin1") === "%PDF") {
                buffer = body;
              } else {
                console.warn("  response was not a PDF -- session may have expired or been blocked");
              }
            }
          }
        } catch (error) {
          // one stubborn row should not end a whole N-document run
          console.warn(`  skipping ${cnr}: ${(error as Error).message.split("\n")[0]}`);
        } finally {
          // the viewer's backdrop covers the whole page -- every path out of a row has
          // to close it, or the next row's click gets intercepted
          const modal = page.locator("#viewFiles");
          if (await modal.isVisible().catch(() => false)) {
            await page.locator("#modal_close").click().catch(() => {});
            await modal.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
          }
        }
        if (!buffer) continue;

        // hash before writing to disk: the same judgment can be listed under a second
        // cnr, and writing first would overwrite -- then delete -- a file we already have
        const hash = createHash("sha256").update(buffer).digest("hex");
        seenCnrs.add(cnr);
        if (seenHashes.has(hash)) {
          console.log(`Duplicate, skipping: ${cnr}`);
          continue;
        }

        const filename = `${cnr}.pdf`;
        writeFileSync(join(PDF_DIR, filename), buffer);
        seenHashes.add(hash);
        downloaded++;

        appendFileSync(MANIFEST_PATH, JSON.stringify({ cnr, title, listingText, hash, filename }) + "\n");
        console.log(`[${downloaded}/${N}] Downloaded ${cnr}`);
      }

      if (downloaded >= N) break;

      const nextButton = page.locator("#example_pdf_next");
      if ((await nextButton.count()) === 0) break;
      const nextClass = await nextButton.getAttribute("class");
      if (nextClass?.includes("disabled")) break;

      // DataTables pages client-side: there is no navigation and no network activity
      // to wait on, so watch the first row's cnr for the swap instead
      const previousFirst = await page
        .locator("#report_body tr input#cnr")
        .first()
        .getAttribute("value")
        .catch(() => null);
      await nextButton.click();
      try {
        await page.waitForFunction(
          (prev) => {
            const value = document.querySelector("#report_body tr input#cnr")?.getAttribute("value");
            return !!value && value !== prev;
          },
          previousFirst,
          { timeout: 30_000 },
        );
      } catch {
        console.warn("Results did not change after paging; stopping here.");
        break;
      }
    }

    console.log(`Done. Downloaded ${downloaded} new PDF(s).`);
    await waitForEnter("Press Enter to close the browser... ");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
