/**
 * Drives a REAL Chromium browser (via Playwright) instead of hand-building
 * HTTP requests. You solve the captcha yourself, inside this automated
 * window, exactly like you do in normal Chrome -- the script just watches
 * and reads the page afterwards.
 *
 * This exists because scr.sci.gov.in blocks plain HTTP calls even with
 * correct session cookies -- a WAF/bot-fingerprint check that a real
 * browser engine passes and a bare HTTP client doesn't.
 *
 *
 * Run with:
 *     npm run scrape:sci:inspect
 */

import { chromium } from "playwright";
import * as cheerio from "cheerio";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { waitForEnter } from "../../core/prompt.js";

const SEARCH_URL = "https://scr.sci.gov.in/scrsearch/";
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEBUG_HTML_PATH = join(__dirname, "_debug_result.html");

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(SEARCH_URL);

  console.log();
  console.log("A browser window just opened.");
  console.log("1. Solve the captcha there and run a real search.");
  console.log("2. Once you see results on screen, come back here and press Enter.");
  await waitForEnter("Press Enter when the results are showing in the browser... ");

  const html = await page.content();
  console.log();
  console.log("URL now:", page.url());
  console.log("Page length:", html.length, "characters");

  const denied = html.toLowerCase().includes("access denied");
  console.log("DENIED:", denied);

  writeFileSync(DEBUG_HTML_PATH, html, "utf-8");
  console.log(`Full page saved to: ${DEBUG_HTML_PATH}  (open it in a browser to inspect)`);

  const $ = cheerio.load(html);
  const tables = $("table");
  console.log();
  console.log(`Found ${tables.length} <table> element(s) on the page.`);

  tables.each((i, table) => {
    const rows = $(table).find("tr");
    if (rows.length <= 1) return;

    console.log(`\n--- table[${i}]: ${rows.length} row(s) ---`);
    rows.slice(0, 5).each((_, row) => {
      // BeautifulSoup's get_text(" ", strip=True) joins each cell's text
      // with spaces so adjacent <td>s don't run together; cheerio's
      // .text() alone would smash them into one word.
      const text = $(row)
        .find("td, th")
        .map((_cellIdx, cell) => $(cell).text().trim())
        .get()
        .filter(Boolean)
        .join(" ");
      if (text) console.log(" ", text.slice(0, 200));
    });
  });

  await waitForEnter("\nPress Enter to close the browser... ");
  await browser.close();
}

main();
