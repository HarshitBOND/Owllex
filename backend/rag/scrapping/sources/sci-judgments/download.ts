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
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { backupToR2, count, has, put } from "../../hashdb.js";
import { uploadRawDocument } from "../../storage.js";

const SEARCH_URL = "https://scr.sci.gov.in/scrsearch/";
const N = Number(process.argv[2]) || 2; // how many new PDFs to download

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || "http://localhost:8000";

const SOURCE = "sci";
const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = join(__dirname, "..", "..", "data", "raw", SOURCE);
const PDF_DIR = join(SOURCE_DIR, "pdfs");
const MANIFEST_PATH = join(SOURCE_DIR, "manifest.jsonl");

// Hands a freshly-downloaded PDF straight to the same admin-upload ingest
// pipeline the RAG Ingest tab uses, so a scrape run doesn't just fill a disk
// folder -- each judgment is chunked, embedded, and counted in the knowledge
// base immediately. Never fatal: a scrape that downloaded the PDF correctly
// should not fail just because ingestion (or its OpenAI/Chroma config) isn't
// available right now.
async function ingestIntoKnowledgeBase(filePath: string, filename: string): Promise<number | null> {
  const token = process.env.BACKEND_INTERNAL_TOKEN;
  if (!token) {
    console.warn("  Skipping knowledge base ingestion: BACKEND_INTERNAL_TOKEN is not set");
    return null;
  }

  try {
    const form = new FormData();
    form.append("files", new Blob([readFileSync(filePath)]), filename);

    const response = await fetch(`${BACKEND_API}/api/v1/rag/ingest`, {
      method: "POST",
      headers: { "x-internal-token": token },
      body: form,
    });

    if (response.status === 409) {
      console.log("  Already in knowledge base (duplicate content)");
      return null;
    }
    if (!response.ok) {
      console.warn(`  Knowledge base ingestion failed (HTTP ${response.status})`);
      return null;
    }

    const data = (await response.json()) as { chunk_count?: number };
    return data.chunk_count ?? 0;
  } catch (error) {
    console.warn(`  Knowledge base ingestion error: ${(error as Error).message}`);
    return null;
  }
}

async function main(): Promise<void> {
  mkdirSync(PDF_DIR, { recursive: true });

  console.log(`Hash index holds ${count()} entries.`);

  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    await page.goto(SEARCH_URL);

    console.log("Solve the captcha and run a search in the browser window that just opened.");
    // No terminal attached when this runs from the admin panel, so watch the DOM
    // for results instead of waiting on stdin. No timeout: a human takes as long
    // as they take to clear the captcha.
    await page.waitForSelector("#report_body tr input#cnr", { timeout: 0 });
    console.log("Results detected, starting downloads.");

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
        if (!cnr || has(`sci:cnr:${cnr}`)) continue;

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

        const hash = createHash("sha256").update(buffer).digest("hex");
        await put(`sci:cnr:${cnr}`, 1);
        if (has(`sci:hash:${hash}`)) {
          console.log(`Duplicate, skipping: ${cnr}`);
          continue;
        }

        const filename = `${cnr}.pdf`;
        const filePath = join(PDF_DIR, filename);
        writeFileSync(filePath, buffer);
        await put(`sci:hash:${hash}`, cnr);
        await backupToR2();
        await uploadRawDocument(SOURCE, hash, ".pdf", filePath);
        downloaded++;

        appendFileSync(MANIFEST_PATH, JSON.stringify({ cnr, title, listingText, hash, filename }) + "\n");
        console.log(`[${downloaded}/${N}] Downloaded ${cnr}`);

        const chunkCount = await ingestIntoKnowledgeBase(filePath, filename);
        if (chunkCount !== null) {
          console.log(`  Added to knowledge base (${chunkCount} chunks)`);
        }
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

    await backupToR2(true);
    console.log(`Done. Downloaded ${downloaded} new PDF(s). Index now holds ${count()} entries.`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
