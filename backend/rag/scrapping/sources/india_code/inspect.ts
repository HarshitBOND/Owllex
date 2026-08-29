// One-off inspector for India Code. Use it when download.ts stops finding
// something: it prints the live shape of an act -- every dc.* field, which
// child document types hang off it, the first child of each type, and the
// bitstreams -- so you can see what the API actually returns today.
//
// Run with:
//     npx tsx inspect.ts "Motor Vehicles Act 1988"

import { chromium } from "playwright";

const SITE = "https://indiacode.gov.in";
const API = `${SITE}/server/api`;
const ACTS_COLLECTION = "69a0c1fb-7b22-4481-b16a-1dc59b5d02e6"; // CENTRAL -> Acts
const QUERY = process.argv.slice(2).join(" ") || "Motor Vehicles Act 1988";

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--disable-gpu"] });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(3000);
  await page.close();

  const get = async (url: string) => {
    const response = await ctx.request.get(url, { headers: { Accept: "application/json" }, timeout: 90_000 });
    if (!response.ok()) throw new Error(`HTTP ${response.status()} ${url}`);
    return response.json();
  };
  const dump = (item: any, indent = "  ") => {
    for (const key of Object.keys(item.metadata ?? {}).sort()) {
      const value = item.metadata[key].map((m: any) => m.value).join(" | ");
      console.log(`${indent}${key} = ${value.replace(/\s+/g, " ").slice(0, 160)}`);
    }
  };

  const hits = await get(
    `${API}/discover/search/objects?configuration=collection&scope=${ACTS_COLLECTION}` +
      `&query=${encodeURIComponent(QUERY)}&sort=score,DESC&page=0&size=5&embed=bundles/bitstreams`,
  );
  const objects = hits._embedded.searchResult._embedded.objects;
  if (objects.length === 0) throw new Error(`nothing matched "${QUERY}"`);

  console.log(`\n${objects.length} match(es); using the first:\n`);
  for (const o of objects) console.log(`  - ${o._embedded.indexableObject.name}`);

  const act = objects[0]._embedded.indexableObject;
  const actId = act.metadata["dc.identifier.act_id"]?.[0]?.value;
  console.log(`\n=== ACT ${act.name}`);
  console.log(`  uuid   ${act.uuid}`);
  console.log(`  page   ${SITE}/act/${act.uuid}`);
  console.log(`  act_id ${actId}`);
  dump(act);

  for (const bundle of act._embedded?.bundles?._embedded?.bundles ?? []) {
    for (const bitstream of bundle._embedded?.bitstreams?._embedded?.bitstreams ?? []) {
      console.log(`  [${bundle.name}] ${bitstream.name} (${bitstream.sizeBytes} bytes) ${bitstream._links.content.href}`);
    }
  }

  const facets = await get(
    `${API}/discover/facets/identifier_collection?query=${encodeURIComponent(`dc.identifier.act_id:${actId}`)}&page=0&size=100`,
  );
  console.log(`\n=== CHILD DOCUMENT TYPES (these are the act page's tabs)`);
  for (const value of facets._embedded.values) console.log(`  ${value.label}: ${value.count}`);

  for (const value of facets._embedded.values) {
    if (value.label === "ACT") continue;
    const children = await get(
      `${API}/discover/search/objects?page=0&size=1&f.identifier_collection=${encodeURIComponent(value.label)},equals` +
        `&f.act_id=${encodeURIComponent(actId)},equals&embed=bundles/bitstreams`,
    );
    const first = children._embedded.searchResult._embedded.objects[0]?._embedded?.indexableObject;
    if (!first) continue;
    console.log(`\n--- first ${value.label}: ${first.name}`);
    dump(first, "    ");
    for (const bundle of first._embedded?.bundles?._embedded?.bundles ?? []) {
      for (const bitstream of bundle._embedded?.bitstreams?._embedded?.bitstreams ?? []) {
        console.log(`    [${bundle.name}] ${bitstream.name} ${bitstream._links.content.href}`);
      }
    }
  }

  const actNumber = act.metadata["dc.identifier.act_number"]?.[0]?.value;
  const actYear = act.metadata["dc.date.act_year"]?.[0]?.value;
  const amendments = await get(
    `${API}/discover/search/objects?query=${encodeURIComponent(`(dc.identifier.act_number:${actNumber} AND dc.date.act_year:${actYear})`)}` +
      `&sort=score,DESC&page=0&size=50&scope=27f13a58-d595-4aef-9d90-1d1170f1460e`,
  );
  console.log(`\n=== AMENDMENTS`);
  for (const o of amendments._embedded.searchResult._embedded.objects) {
    console.log(`  ${o._embedded.indexableObject.name}`);
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
