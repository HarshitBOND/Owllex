// Raw source document storage in Cloudflare R2, mirroring hashdb.ts's
// backupToR2() pattern. Content-addressed at raw/<source>/<hash><ext> per
// ARCHITECTURE.md's locked storage design. No-ops until R2 keys are set.

import { AwsClient } from "aws4fetch";
import { readFileSync } from "node:fs";
import "dotenv/config";

export async function uploadRawDocument(source: string, hash: string, ext: string, filePath: string): Promise<void> {
  const account = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!account || !accessKeyId || !secretAccessKey || !bucket) return;

  const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  const key = `raw/${source}/${hash}${ext}`;
  const response = await client.fetch(`https://${account}.r2.cloudflarestorage.com/${bucket}/${key}`, {
    method: "PUT",
    body: readFileSync(filePath),
  });
  if (!response.ok) {
    console.warn(`  R2 upload failed for ${key}: HTTP ${response.status}`);
  }
}
