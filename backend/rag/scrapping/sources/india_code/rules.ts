// Downloads India Code's "Rule" collection directly -- notified Rules
// instruments with a real PDF attached, e.g. "Solid Waste Management Rules,
// 2026". download.ts finds RULE-labelled items too, but only by walking each
// Act's child facets, which surfaces individual provision stubs with no PDF
// bundle at all. This collection is the actual instrument-level source; see
// inspect.ts's bundle dump for the difference (ORIGINAL/TEXT/THUMBNAIL here,
// nothing on the facet-derived children).
//
// Same output tree as download.ts (data/raw/india_code), same docKey scheme
// (RULE:<docId>), so this just fills in PDFs the other crawl missed.
//
// Run with:
//     npx tsx rules.ts --limit 5

import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { backupToR2, count, get as getHash, put } from "../../hashdb.js";

const SITE = "https://indiacode.gov.in";
const API = `${SITE}/server/api`;
const COLLECTION = "da7bfea8-3973-4961-b873-d99e9f48512f"; // "Rule"
const PAGE_SIZE = 100;
const DELAY_MS = 400;

const SOURCE = "india_code";
const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = join(__dirname, "..", "..", "data", "raw", SOURCE);
const PDF_DIR = join(SOURCE_DIR, "pdfs");
const MANIFEST_PATH = join(SOURCE_DIR, "manifest.jsonl");

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const LIMIT = Number(arg("--limit")) || 5;

const meta = (item: any, key: string) => item.metadata?.[key]?.[0]?.value ?? null;

async function main() {
  mkdirSync(PDF_DIR, { recursive: true });
  console.log(`Hash index holds ${count()} entries.`);

  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    const ctx = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });
    const page = await ctx.newPage();
    await page.goto(SITE, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(3000);
    await page.close();

    const get = async (url: string) => {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await ctx.request.get(url, { headers: { Accept: "application/json" }, timeout: 90_000 });
        if (response.ok()) return response.json();
        if (response.status() < 500) throw new Error(`HTTP ${response.status()} ${url}`);
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1))); // the site 5xx's under load
      }
      throw new Error(`gave up after 3 tries: ${url}`);
    };

    let stored = 0;
    let skipped = 0;
    let seen = 0;

    for (let p = 0; seen < LIMIT; p++) {
      const listing = await get(
        `${API}/discover/search/objects?configuration=collection&scope=${COLLECTION}` +
          `&sort=dc.date.issued,DESC&page=${p}&size=${PAGE_SIZE}&embed=bundles/bitstreams`,
      );
      const objects = listing._embedded.searchResult._embedded.objects;
      if (objects.length === 0) break;

      for (const object of objects) {
        if (seen >= LIMIT) break;
        seen++;
        const item = object._embedded.indexableObject;
        const docId = meta(item, "dc.identifier.id") ?? item.uuid;
        const docKey = `RULE:${docId}`;

        const pdf = (item._embedded?.bundles?._embedded?.bundles ?? [])
          .filter((b: any) => b.name === "ORIGINAL")
          .flatMap((b: any) => b._embedded?.bitstreams?._embedded?.bitstreams ?? [])
          .find((b: any) => /\.pdf$/i.test(b.name));

        if (!pdf) {
          console.log(`  [${seen}/${LIMIT}] no ORIGINAL PDF: ${item.name}`);
          continue;
        }

        await new Promise((r) => setTimeout(r, DELAY_MS));
        const response = await ctx.request.get(pdf._links.content.href, { timeout: 180_000 });
        const bytes = await response.body();
        if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
          console.log(`  [${seen}/${LIMIT}] not a PDF: ${item.name}`);
          continue;
        }

        const hash = createHash("sha256").update(bytes).digest("hex");
        const previous = getHash(`${SOURCE}:${docKey}`);
        if (previous === hash) {
          skipped++;
          console.log(`  [${seen}/${LIMIT}] unchanged: ${item.name}`);
          continue;
        }

        const actYear = meta(item, "dc.date.act_year") ?? "0000";
        const filename = `rule_${actYear}_${item.uuid.slice(0, 8)}.pdf`;
        const row = {
          docKey,
          docId,
          uuid: item.uuid,
          title: item.name,
          docType: "RULE",
          url: `${SITE}/act/${item.uuid}`,
          actId: meta(item, "dc.identifier.act_id"),
          actNumber: meta(item, "dc.identifier.act_number"),
          actYear,
          issuedOn: meta(item, "dc.date.issued"),
          repealed: meta(item, "dc.identifier.repealed") === "true",
        };

        writeFileSync(join(PDF_DIR, filename), bytes);
        await put(`${SOURCE}:${docKey}`, hash);
        await backupToR2();
        stored++;

        appendFileSync(
          MANIFEST_PATH,
          JSON.stringify({ ...row, filename, hash, source: SOURCE, fetchedAt: new Date().toISOString() }) + "\n",
        );
        console.log(`  [${seen}/${LIMIT}] ${previous ? "updated" : "new"}: ${filename} -- ${item.name}`);
      }

      const info = listing._embedded.searchResult.page;
      if (info.number + 1 >= info.totalPages) break;
    }

    await backupToR2(true);
    console.log(`\nDone. ${stored} new/changed, ${skipped} unchanged. Index now holds ${count()} entries.`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
