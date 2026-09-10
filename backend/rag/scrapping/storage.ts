// Raw source document storage on the mounted volume. Replaces the Cloudflare R2
// upload this used to do.
//
// Content-addressed at <PDF_ROOT>/<source>/<year>/<hash><ext>, which is the same
// layout rag/core/paths.py writes, so a scraped document and an ingested one end
// up in the same place under the same name. Writing it twice is therefore free:
// the second write finds the file already there.
//
// This copy is the safety net rather than the primary path -- download.ts calls
// the ingest API best-effort, and ingestion archives the document itself. Keeping
// a copy here means a scrape whose ingest call failed is still on disk to retry.

import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { dataRoot, pdfRoot } from "./paths.js";

export async function uploadRawDocument(
  source: string,
  hash: string,
  ext: string,
  filePath: string,
): Promise<void> {
  const year = String(new Date().getUTCFullYear());
  const directory = join(pdfRoot(), source, year);
  const destination = join(directory, `${hash}${ext}`);

  // Content-addressed: identical bytes, already archived.
  if (existsSync(destination)) return;

  try {
    mkdirSync(directory, { recursive: true });
    // Written to a sibling temp file and renamed, so an interrupted copy leaves
    // nothing behind rather than a truncated PDF that later fails to parse.
    const staging = `${destination}.part`;
    copyFileSync(filePath, staging);
    renameSync(staging, destination);
  } catch (error) {
    console.warn(`  archive failed for ${source}/${hash}${ext} under ${dataRoot()}: ${error}`);
    rmSync(`${destination}.part`, { force: true });
  }
}
