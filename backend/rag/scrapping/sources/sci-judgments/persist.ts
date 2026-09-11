// Commits a downloaded judgment PDF to disk and marks it fetched.
//
// Pulled out of download.ts so this is testable without pulling in Playwright
// (the rest of that file launches a real Chromium) and so the ordering this
// exists to get right -- see PRODUCTION_TODO.md T3 -- is in exactly one place.
//
// The bug this fixes: the old code called `put("sci:cnr:...")`, which is what
// the top of the scrape loop checks to skip a row as already-downloaded,
// *before* the PDF was written and the manifest row appended. A crash, kill or
// OOM in that window left LMDB asserting the judgment was fetched when nothing
// was stored on disk -- and since `has("sci:cnr:...")` is the skip check, no
// future run ever fetched it again. The fix is commit-last discipline, the
// same rule rag/app/ingest/pipeline.py's module docstring documents for the
// Python side: only mark a thing done after everything it depends on actually
// exists.

import { createHash } from "node:crypto";
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { backupHashIndex, get, has, put } from "../../hashdb.js";
import { uploadRawDocument } from "../../storage.js";

export interface DownloadedJudgment {
  cnr: string;
  title: string | null;
  listingText: string;
  buffer: Buffer;
  /**
   * The document's own year (filing/decision), not the year it happened to be
   * scraped -- see PRODUCTION_TODO.md T4. Nothing populates this today: the
   * SCI search results page carries no parsed date, only `listingText`'s free
   * text and the CNR (which does encode a year, but parsing it is future
   * work, not this field's job). Left `undefined` here, storage.ts buckets
   * the archived copy under `unknown-year/` rather than guessing.
   */
  year?: number | string | null;
}

export interface PersistTargets {
  source: string;
  pdfDir: string;
  manifestPath: string;
}

export type PersistResult =
  | { status: "written"; filePath: string; filename: string; hash: string }
  | { status: "duplicate"; hash: string; existingCnr: unknown };

export async function persistDownloadedJudgment(
  judgment: DownloadedJudgment,
  targets: PersistTargets,
): Promise<PersistResult> {
  const { cnr, title, listingText, buffer, year } = judgment;
  const { source, pdfDir, manifestPath } = targets;

  const hash = createHash("sha256").update(buffer).digest("hex");

  if (has(`${source}:hash:${hash}`)) {
    // The content is already archived under a different CNR (a re-listed or
    // duplicate filing). Nothing is being written for *this* CNR, so there is
    // nothing a crash between here and the next line could lose -- safe to
    // mark it done immediately rather than defer it.
    const existingCnr = get(`${source}:hash:${hash}`);
    await put(`${source}:cnr:${cnr}`, 1);
    return { status: "duplicate", hash, existingCnr };
  }

  const filename = `${cnr}.pdf`;
  const filePath = join(pdfDir, filename);

  // Everything below is the actual commitment of this document. Both LMDB
  // markers -- "this hash is known" and "this CNR is done" -- are written
  // only after the manifest row they describe already exists, and in that
  // order (hash, then CNR) so a crash between the two makes a retry re-enter
  // this same function with the hash already known: it takes the duplicate
  // branch above and marks the CNR done immediately, which is correct because
  // the manifest row for it was already committed before either marker was
  // set. Marking the CNR before the hash would let that same crash window
  // make a retry misread its own interrupted attempt as "someone else already
  // has this content" and skip writing the manifest row at all -- caught by
  // the crash-injection test for this function, not by inspection.
  writeFileSync(filePath, buffer);
  await backupHashIndex();
  await uploadRawDocument(source, hash, ".pdf", filePath, year);
  appendFileSync(manifestPath, JSON.stringify({ cnr, title, listingText, hash, filename }) + "\n");
  await put(`${source}:hash:${hash}`, cnr);
  await put(`${source}:cnr:${cnr}`, 1);

  return { status: "written", filePath, filename, hash };
}
