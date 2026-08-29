// O(1) "have I already got this?" index for the scrapers, on disk.
//
// Replaces reading manifest.jsonl into a Set at startup: that cost a full file
// parse before the first download and held every hash in RAM, which stops
// working somewhere well short of the 50,000-document target. Here a lookup is
// a B-tree probe against a memory-mapped file, so startup is constant and so is
// memory, whatever the index holds.
//
// Deliberately NOT the same database as rag/hash_db.py. That one means
// "ingested"; this one means "downloaded", and sharing them would make the
// ingest pipeline skip every document the scraper had just fetched.
//
// Keys are namespaced by source, e.g. "sci:hash:<sha256>", "india_code:<docKey>".

import { AwsClient } from "aws4fetch";
import { open } from "lmdb";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

const db = open({ path: join(__dirname, "data", "hash_index.lmdb"), compression: false });

export const has = (key: string): boolean => db.doesExist(key);
export const get = (key: string) => db.get(key);
export const put = (key: string, value: unknown = 1) => db.put(key, value);
export const remove = (key: string) => db.remove(key);
export const count = (): number => (db.getStats() as { entryCount: number }).entryCount;

// A backup is a compacted copy of the whole index, so doing one per document
// would dominate a bulk run. Every put() can call this; most calls no-op.
const MIN_BACKUP_INTERVAL_MS = Number(process.env.HASH_DB_BACKUP_INTERVAL_SECONDS ?? 300) * 1000;
let lastBackup = 0;

export async function backupToR2(force = false): Promise<void> {
  const account = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!account || !accessKeyId || !secretAccessKey || !bucket) return; // keys not provided yet

  if (!force && Date.now() - lastBackup < MIN_BACKUP_INTERVAL_MS) return;

  const dir = await mkdtemp(join(tmpdir(), "hash_index_backup_"));
  try {
    const snapshot = join(dir, "data.mdb");
    await db.backup(snapshot, true);

    const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
    const key = process.env.R2_SCRAPE_HASH_BACKUP_KEY ?? "hash_index_backup/scrapping_hash_index.mdb";
    const response = await client.fetch(`https://${account}.r2.cloudflarestorage.com/${bucket}/${key}`, {
      method: "PUT",
      body: readFileSync(snapshot),
    });
    if (!response.ok) {
      console.warn(`  R2 backup failed: HTTP ${response.status}`);
      return;
    }
    lastBackup = Date.now();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
