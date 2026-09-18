// Queues a freshly-downloaded document for the ingest worker instead of
// POSTing it to the serving API (PRODUCTION_TODO.md T11). The old code called
// /api/v1/rag/ingest and awaited the job to a terminal status; with one
// gunicorn worker, a slow OCR run on an earlier document would stall every
// user query for as long as this script's own loop sat there polling. Writing
// straight into INBOX_ROOT/<source>/ -- the same drop directory a manual bulk
// import uses, and the same court-hint convention ingest_worker.py already
// reads from a top-level subdirectory name -- means a scrape run never talks
// to the API at all, and owllex-ingest.service (a separate process, per T2's
// single-writer model) drains it on its own schedule.
//
// Pulled out of download.ts (same reason as persist.ts, see its header): that
// file launches a real Chromium as an unconditional side effect of import, so
// nothing in it can be exercised from a test.

import { copyFileSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { inboxRoot } from "../../paths.js";

/**
 * Copies `filePath` into `INBOX_ROOT/<source>/<filename>` for the ingest
 * worker to pick up. Never throws: a scrape that downloaded and archived a
 * document correctly should not fail just because the inbox isn't writable
 * right now -- the archived copy is already durable by the time this runs,
 * so a queue failure only costs a manual re-drop, not the document itself.
 * Returns the queued path, or null if queueing failed.
 */
export function queueForIngest(source: string, filePath: string, filename: string): string | null {
  try {
    const targetDir = join(inboxRoot(), source);
    mkdirSync(targetDir, { recursive: true });
    const target = join(targetDir, filename);
    // Write under a .part name and rename into place -- ingest_worker.py
    // skips .part files outright and also waits out a settle period on
    // anything freshly modified, but matching the rest of the codebase's
    // atomic-write convention costs nothing and avoids a window where the
    // worker could see a truncated copy on a slow filesystem.
    const partial = `${target}.part`;
    copyFileSync(filePath, partial);
    renameSync(partial, target);
    return target;
  } catch {
    return null;
  }
}
