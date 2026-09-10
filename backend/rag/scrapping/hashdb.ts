// O(1) "have I already got this?" index for the scrapers, on disk.
//
// Replaces reading manifest.jsonl into a Set at startup: that cost a full file
// parse before the first download and held every hash in RAM, which stops
// working somewhere well short of the 50,000-document target. Here a lookup is
// a B-tree probe against a memory-mapped file, so startup is constant and so is
// memory, whatever the index holds.
//
// Deliberately NOT the same database as rag/core/hash_index.py. That one means
// "ingested"; this one means "downloaded", and sharing them would make the
// ingest pipeline skip every document the scraper had just fetched.
//
// Keys are namespaced by source, e.g. "sci:hash:<sha256>", "india_code:<docKey>".

import { open } from "lmdb";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";
import { backupRoot, dataRoot } from "./paths.js";

// Lives under the mounted volume, not next to this file: the code directory is
// redeployed and the index is not. SCRAPE_LMDB_PATH overrides it; the default
// sits beside the ingest index in <DATA_ROOT>/lmdb/.
const DB_PATH = process.env.SCRAPE_LMDB_PATH?.trim() || join(dataRoot(), "lmdb", "scrapping_hashdb");

mkdirSync(DB_PATH, { recursive: true });

const db = open({ path: DB_PATH, compression: false });

export const has = (key: string): boolean => db.doesExist(key);
export const get = (key: string) => db.get(key);
export const put = (key: string, value: unknown = 1) => db.put(key, value);
export const remove = (key: string) => db.remove(key);
export const count = (): number => (db.getStats() as { entryCount: number }).entryCount;

// A backup is a compacted copy of the whole index, so doing one per document
// would dominate a bulk run. Every put() can call this; most calls no-op.
const MIN_BACKUP_INTERVAL_MS = Number(process.env.HASH_DB_BACKUP_INTERVAL_SECONDS ?? 300) * 1000;
let lastBackup = 0;

/**
 * Snapshot the "downloaded" index onto the mounted volume.
 *
 * Writes to <BACKUP_ROOT>/scrapping/ rather than to R2. Deliberately a single
 * rolling snapshot, not one per day: this index is reconstructible by re-running
 * a scrape, so it needs crash protection rather than history. The corpus's own
 * nightly, dated backups are in rag/core/backup.py.
 */
export async function backupHashIndex(force = false): Promise<void> {
  if (!force && Date.now() - lastBackup < MIN_BACKUP_INTERVAL_MS) return;

  const directory = join(backupRoot(), "scrapping");
  try {
    mkdirSync(directory, { recursive: true });
    // lmdb's backup is a consistent read-transaction copy, so this is safe to
    // run while a scrape is still writing.
    await db.backup(join(directory, "scrapping_hash_index.mdb"), true);
    lastBackup = Date.now();
  } catch (error) {
    // A failed backup must not abort a scrape that is otherwise working.
    console.warn(`  hash index backup failed: ${error}`);
  }
}
