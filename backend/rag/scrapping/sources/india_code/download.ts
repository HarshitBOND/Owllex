// India Code -- acts with their sections, rules, schedules and PDFs.
//
// Use the bare domain. The app is served from www.indiacode.gov.in but its API lives on
// indiacode.gov.in, and the preflight from www is refused, so every deep page dies of
// CORS and renders a 500 that has nothing to do with the server. See README.md.
//
//     npx tsx download.ts --acts 5

import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { backupToR2, count, get as getHash, put } from "../../hashdb.js";
import { uploadRawDocument } from "../../storage.js";

const SITE = "https://indiacode.gov.in";
const API = `${SITE}/server/api`;
const AMENDMENTS_SCOPE = "27f13a58-d595-4aef-9d90-1d1170f1460e"; // "Central" under All Amendments
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
const JURISDICTION = (arg("--jurisdiction") ?? "CENTRAL").toUpperCase();
const MAX_ACTS = Number(arg("--acts")) || 5;
const SEARCH = arg("--search");
const ONLY_TYPES = arg("--types")?.split(",").map((t) => t.trim().toUpperCase()) ?? null;
const SKIP_PDF = args.includes("--skip-pdf");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// dc.* values are arrays of {value}
const meta = (item: any, key: string) => item.metadata?.[key]?.[0]?.value ?? null;
const metaAll = (item: any, key: string) => (item.metadata?.[key] ?? []).map((m: any) => m.value);

const stripHtml = (html: string | null) =>
  !html
    ? ""
    : html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|tr|li)>/gi, "\n")
        .replace(/<sup>(\d+)<\/sup>/gi, "[$1]")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

const OPERATIONS: Record<string, string> = {
  subs: "substituted",
  ins: "inserted",
  omit: "omitted",
  add: "added",
  rep: "repealed",
  del: "deleted",
};

// "<sup>3</sup>. Subs. by Act 32 of 2019, s. 2, for clause (1) (w.e.f. 1-9-2019)."
function parseFootnotes(html: string | null) {
  if (!html) return [];
  const parts = html.split(/<sup>\s*(\d+)\s*<\/sup>/i);
  const notes = [];
  let lastCitation = null;
  for (let i = 1; i < parts.length; i += 2) {
    const text = stripHtml(parts[i + 1] ?? "").replace(/^\.\s*/, "").trim();
    if (!text) continue;
    const word = text.match(/\b(subs|ins|omit(?:ted)?|add(?:ed)?|rep(?:ealed)?|del(?:eted)?|renumbered|inserted|substituted)\b/i);
    // central acts cite "Act 32 of 2019", states cite "Mah. 9 of 2021", and a run of
    // notes on one section says "ibid" for whichever act came before
    const citation = text.match(/\bby\s+(Act\s+\d+\s+of\s+\d+|[A-Z][\w.]*\.\s*\d+\s+of\s+\d+)/);
    if (citation) lastCitation = citation[1].trim();
    const key = word ? word[1].toLowerCase() : null;
    notes.push({
      marker: parts[i],
      text,
      operation: key ? (OPERATIONS[key] ?? key) : null,
      amendedBy: citation ? citation[1].trim() : /\bibid\b/i.test(text) ? lastCitation : null,
    });
  }
  return notes;
}

async function main() {
  mkdirSync(PDF_DIR, { recursive: true });

  // keyed per leaf document, never per act: an act you already hold can still gain an
  // amended section, so acts are always re-walked and each child's own hash decides
  console.log(`Hash index holds ${count()} entries.`);

  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--disable-gpu"] });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(3000); // the API needs the cookies and CSRF token this hands out
  await page.close();

  const get = async (url: string) => {
    await sleep(DELAY_MS);
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await ctx.request.get(url, { headers: { Accept: "application/json" }, timeout: 90_000 });
      if (response.ok()) return response.json();
      if (response.status() < 500) throw new Error(`HTTP ${response.status()} ${url}`);
      await sleep(3000 * (attempt + 1)); // the site 5xx's under load
    }
    throw new Error(`gave up after 3 tries: ${url}`);
  };

  let stored = 0;
  let skipped = 0;
  const store = async (bytes: Buffer, filename: string, row: any) => {
    const hash = createHash("sha256").update(bytes).digest("hex");
    const key = `${SOURCE}:${row.docKey}`;
    const previous = getHash(key);
    if (previous === hash) {
      skipped++;
      return;
    }
    const filePath = join(PDF_DIR, filename);
    writeFileSync(filePath, bytes);
    await put(key, hash);
    await backupToR2();
    await uploadRawDocument(SOURCE, hash, ".pdf", filePath);
    stored++;
    appendFileSync(
      MANIFEST_PATH,
      JSON.stringify({ ...row, filename, hash, source: SOURCE, fetchedAt: new Date().toISOString() }) + "\n",
    );
    console.log(`    ${previous ? "updated" : "new"}: ${filename}`);
  };

  const savePdfs = async (item: any, stem: string, row: any) => {
    if (SKIP_PDF) return;
    const pdfs = [];
    for (const bundle of item._embedded?.bundles?._embedded?.bundles ?? []) {
      if (bundle.name !== "ORIGINAL") continue;
      for (const bitstream of bundle._embedded?.bitstreams?._embedded?.bitstreams ?? []) {
        if (/\.pdf$/i.test(bitstream.name)) pdfs.push(bitstream);
      }
    }
    for (let i = 0; i < pdfs.length; i++) {
      await sleep(DELAY_MS);
      const response = await ctx.request.get(pdfs[i]._links.content.href, { timeout: 180_000 });
      const bytes = await response.body();
      // an expired session hands back an HTML error page with a 200
      if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
        console.warn(`    not a PDF: ${pdfs[i].name}`);
        continue;
      }
      await store(bytes, `${stem}${i === 0 ? "" : `_${i + 1}`}.pdf`, {
        ...row,
        docKey: `BITSTREAM:${pdfs[i].uuid}`,
        bitstreamUuid: pdfs[i].uuid,
        originalName: pdfs[i].name,
        sizeBytes: pdfs[i].sizeBytes,
      });
    }
  };

  const communities = await get(`${API}/core/communities?size=100`);
  const community = communities._embedded.communities.find((c: any) => c.name.toUpperCase() === JURISDICTION);
  if (!community) {
    const names = communities._embedded.communities.map((c: any) => c.name).join(", ");
    throw new Error(`No jurisdiction "${JURISDICTION}". Available: ${names}`);
  }

  const collections = await get(`${API}/core/communities/${community.uuid}/collections?size=100`);
  const actsCollection = collections._embedded.collections.find((c: any) => c.name === "Acts");
  if (!actsCollection) throw new Error(`${community.name} has no "Acts" collection`);
  console.log(`${community.name} -> Acts collection ${actsCollection.uuid}\n`);

  let actsDone = 0;
  for (let actPage = 0; actsDone < MAX_ACTS; actPage++) {
    const listing = await get(
      `${API}/discover/search/objects?configuration=collection&scope=${actsCollection.uuid}` +
        (SEARCH ? `&query=${encodeURIComponent(SEARCH)}&sort=score,DESC` : `&sort=dc.date.issued,DESC`) +
        `&page=${actPage}&size=${PAGE_SIZE}&embed=bundles/bitstreams`,
    );
    const objects = listing._embedded.searchResult._embedded.objects;
    if (objects.length === 0) break;

    for (const object of objects) {
      if (actsDone >= MAX_ACTS) break;
      const act = object._embedded.indexableObject;
      const actId = meta(act, "dc.identifier.act_id");
      const actYear = meta(act, "dc.date.act_year") ?? "0000";
      const actNumber = meta(act, "dc.identifier.act_number");
      actsDone++;
      console.log(`[${actsDone}/${MAX_ACTS}] ${act.name}`);

      const amendments = [];
      if (actNumber && actYear !== "0000") {
        const query = encodeURIComponent(`(dc.identifier.act_number:${actNumber} AND dc.date.act_year:${actYear})`);
        const found = await get(
          `${API}/discover/search/objects?query=${query}&sort=score,DESC&page=0&size=50&scope=${AMENDMENTS_SCOPE}`,
        );
        for (const hit of found._embedded.searchResult._embedded.objects) {
          const amendment = hit._embedded.indexableObject;
          amendments.push({ uuid: amendment.uuid, title: amendment.name, url: `${SITE}/act/${amendment.uuid}` });
        }
        console.log(`  amendments: ${amendments.length}`);
      }

      const actStem = `act_${actYear}_${act.uuid.slice(0, 8)}`;
      const actRow = {
        docKey: `ACT:${actId ?? act.uuid}`,
        uuid: act.uuid,
        handle: act.handle,
        cnr: act.uuid,
        title: act.name,
        docType: "ACT",
        url: `${SITE}/act/${act.uuid}`,
        jurisdiction: meta(act, "dc.identifier.state_name"),
        ministry: meta(act, "dc.identifier.ministry_name"),
        department: meta(act, "dc.identifier.department_name"),
        actId,
        actName: act.name,
        actNumber,
        actYear,
        enactedOn: meta(act, "dc.date.enact_date"),
        longTitle: meta(act, "dc.title.long_title"),
        preamble: stripHtml(meta(act, "dc.identifier.preamble_description")),
        referenceSites: metaAll(act, "dc.identifier.reference_sites"),
        repealed: meta(act, "dc.identifier.repealed") === "true",
        amendments,
      };

      await savePdfs(act, actStem, actRow);
      await store(Buffer.from(JSON.stringify(actRow, null, 2), "utf-8"), `${actStem}.json`, actRow);
      if (!actId) continue;

      // the act page's tabs are exactly this facet
      const facets = await get(
        `${API}/discover/facets/identifier_collection?query=${encodeURIComponent(`dc.identifier.act_id:${actId}`)}&page=0&size=100`,
      );
      const types = [];
      const counts = [];
      for (const value of facets._embedded.values) {
        counts.push(`${value.label} ${value.count}`);
        if (value.label === "ACT") continue;
        if (ONLY_TYPES && !ONLY_TYPES.includes(value.label)) continue;
        types.push(value.label);
      }
      console.log(`  children: ${counts.join(", ") || "none"}`);

      for (const type of types) {
        for (let childPage = 0; ; childPage++) {
          const sort = type === "SECTION" ? "&sort=dc.identifier.order_number,ASC" : "";
          const children = await get(
            `${API}/discover/search/objects?page=${childPage}&size=${PAGE_SIZE}${sort}` +
              `&f.identifier_collection=${encodeURIComponent(type)},equals` +
              `&f.act_id=${encodeURIComponent(actId)},equals&embed=bundles/bitstreams`,
          );
          const rows = children._embedded.searchResult._embedded.objects;
          if (rows.length === 0) break;

          for (const childObject of rows) {
            const doc = childObject._embedded.indexableObject;
            const docId = meta(doc, "dc.identifier.id") ?? doc.uuid;
            const sectionNumber = meta(doc, "dc.identifier.section_number");
            const footnotes = parseFootnotes(meta(doc, "dc.identifier.section_footnote"));
            const body = stripHtml(meta(doc, "dc.identifier.section_page_note"));
            const stem =
              `${type.toLowerCase().replace(/\s+/g, "")}_${actYear}` +
              `${sectionNumber ? `_s${sectionNumber}` : ""}_${doc.uuid.slice(0, 8)}`;

            const docRow = {
              docKey: `${type}:${docId}`,
              uuid: doc.uuid,
              handle: doc.handle,
              cnr: doc.uuid,
              title: doc.name,
              docType: type,
              url: `${SITE}/act/${act.uuid}`,
              docId,
              linkedIds: metaAll(doc, "dc.identifier.linked_id"),
              jurisdiction: meta(doc, "dc.identifier.state_name"),
              ministry: meta(doc, "dc.identifier.ministry_name"),
              department: meta(doc, "dc.identifier.department_name"),
              actId,
              actName: meta(doc, "dc.title.act_name") ?? act.name,
              actNumber,
              actYear,
              sectionNumber,
              orderNumber: meta(doc, "dc.identifier.order_number"),
              nextSection: meta(doc, "dc.identifier.next_section"),
              pageNumber: meta(doc, "dc.identifier.page_number"),
              issuedOn: meta(doc, "dc.date.issued"),
              repealed: meta(doc, "dc.identifier.repealed") === "true",
              actRepealed: meta(doc, "dc.identifier.act_repealed") === "true",
              footnotes,
            };

            if (body || footnotes.length) {
              let text = `${doc.name}\n${docRow.actName}\n`;
              if (sectionNumber) text += `Section ${sectionNumber}\n`;
              text += `\n${body}\n`;
              if (footnotes.length) {
                text += "\nFootnotes\n";
                for (const note of footnotes) text += `[${note.marker}] ${note.text}\n`;
              }
              await store(Buffer.from(text, "utf-8"), `${stem}.txt`, docRow);
            }

            await savePdfs(doc, stem, docRow);
          }

          const info = children._embedded.searchResult.page;
          if (info.number + 1 >= info.totalPages) break;
        }
      }
    }

    const info = listing._embedded.searchResult.page;
    if (info.number + 1 >= info.totalPages) break;
  }

  await backupToR2(true);
  console.log(`\nDone. ${stored} new or changed, ${skipped} unchanged. Index now holds ${count()} entries.`);
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
