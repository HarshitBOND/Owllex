// Raw source document storage on the mounted volume. Replaces the Cloudflare R2
// upload this used to do.
//
// Content-addressed at <PDF_ROOT>/<source>/<year>/<hash><ext>, which is the same
// layout rag/core/paths.py writes, so a scraped document and an ingested one end
// up in the same place under the same name. Writing it twice is therefore free:
// the second write finds the file already there -- *if* the year segment
// agrees, which is why the caller supplies it rather than this module guessing.
//
// This copy is the safety net rather than the primary path -- download.ts calls
// the ingest API best-effort, and ingestion archives the document itself. Keeping
// a copy here means a scrape whose ingest call failed is still on disk to retry.

import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { dataRoot, pdfRoot } from "./paths.js";

// A plausible calendar year for an Indian legal document, matching
// rag/core/paths.py::_year_segment's own range check.
const PLAUSIBLE_YEAR = /^(1[6-9]\d{2}|2[01]\d{2})$/;

function yearSegment(year: number | string | null | undefined): string {
  const asString = year == null ? "" : String(year).trim();
  const match = asString.match(PLAUSIBLE_YEAR);
  if (match) return match[0];
  // Deliberately not `new Date().getUTCFullYear()`: silently filing an
  // unknown-dated document under today's year reads as confidently wrong --
  // rag/core/paths.py does fall back to the current year for its own unknown
  // case, but the download-year bug this replaces was exactly that kind of
  // silent, plausible-looking wrongness, so this makes the gap visible
  // instead of matching it. See PRODUCTION_TODO.md T4.
  return "unknown-year";
}

export async function uploadRawDocument(
  source: string,
  hash: string,
  ext: string,
  filePath: string,
  year?: number | string | null,
): Promise<void> {
  const directory = join(pdfRoot(), source, yearSegment(year));
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
