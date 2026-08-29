// One-time backfill: existing manifest.jsonl rows -> LMDB hash index.
//
// The scrapers no longer read manifest.jsonl at startup, so hashes already
// harvested would look new and get re-downloaded. Run this once before the
// first LMDB-backed run. Re-running it is harmless.
//
//     npx tsx migrate-manifests.ts

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { backupToR2, count, has, put } from "./hashdb.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  for (const source of ["sci", "india_code"]) {
    const manifest = join(__dirname, "data", "raw", source, "manifest.jsonl");
    if (!existsSync(manifest)) {
      console.log(`${source}: no manifest, skipping.`);
      continue;
    }

    const keys = new Set<string>();
    let rows = 0;
    for (const line of readFileSync(manifest, "utf-8").split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      rows++;
      if (source === "sci") {
        if (row.cnr) keys.add(`sci:cnr:${row.cnr}`);
        if (row.hash) keys.add(`sci:hash:${row.hash}`);
        if (row.cnr) await put(`sci:cnr:${row.cnr}`, 1);
        if (row.hash) await put(`sci:hash:${row.hash}`, row.cnr ?? 1);
      } else {
        // manifests written before docKey existed still carry docType + docId/uuid,
        // which is what docKey was built from. Act PDFs are the one gap: they are now
        // keyed by bitstream uuid, which the old rows never recorded, so those re-fetch once.
        const docKey =
          row.docKey ??
          (row.docType === "ACT"
            ? `ACT:${row.actId ?? row.uuid}`
            : row.docType && (row.docId ?? row.uuid)
              ? `${row.docType}:${row.docId ?? row.uuid}`
              : null);
        if (!docKey) continue;
        keys.add(`india_code:${docKey}`);
        await put(`india_code:${docKey}`, row.hash);
      }
    }

    const verified = [...keys].filter((key) => has(key)).length;
    console.log(`${source}: ${rows} rows -> ${keys.size} keys, ${verified} verified present.`);
    if (verified !== keys.size) console.log(`${source}: WARNING -- count mismatch, some keys did not land.`);
  }

  await backupToR2(true);
  console.log(`Index now holds ${count()} entries.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
