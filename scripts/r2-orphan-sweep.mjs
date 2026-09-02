/**
 * Reports (and optionally deletes) R2 objects that no Mongo row points at.
 *
 * Corpus deletes used to drop their Mongo rows without touching R2, so every
 * document ever removed from a corpus is still being paid for. That leak is
 * fixed at the source, but nothing cleans up what it already left behind --
 * this does.
 *
 * Dry run by default. Pass --delete to actually remove what it finds.
 *
 *   node scripts/r2-orphan-sweep.mjs
 *   node scripts/r2-orphan-sweep.mjs --delete
 */
import { AwsClient } from "aws4fetch"
import mongoose from "mongoose"

const DELETE = process.argv.includes("--delete")

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_PRIVATE_BUCKET,
  MONGODB_URI,
  MONGODB_DB,
} = process.env

for (const [name, value] of Object.entries({
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_PRIVATE_BUCKET,
  MONGODB_URI,
})) {
  if (!value) {
    console.error(`Missing required env var ${name}`)
    process.exit(1)
  }
}

// Keys under these prefixes belong to the public ingest pipeline and are owned
// by the LMDB hash index, not by any Mongo collection. They would every one of
// them look like an orphan here.
const SKIP_PREFIXES = ["raw/", "public/", "hash_index_backup/"]

const client = new AwsClient({
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  service: "s3",
  region: "auto",
})
const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_PRIVATE_BUCKET}`
// ListObjectsV2 returns a flat, fixed shape, so it is read with regexes rather
// than pulling an XML parser into the dependency tree for one maintenance script.
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))
  return m ? m[1] : null
}

const unescapeXml = (v) =>
  v
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")

async function* listObjects() {
  let token
  do {
    const url = new URL(endpoint)
    url.searchParams.set("list-type", "2")
    url.searchParams.set("max-keys", "1000")
    if (token) url.searchParams.set("continuation-token", token)

    const res = await client.fetch(url.toString())
    if (!res.ok) throw new Error(`R2 list failed: HTTP ${res.status}`)
    const xml = await res.text()

    for (const [, block] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = tag(block, "Key")
      if (key) yield { key: unescapeXml(key), size: Number(tag(block, "Size")) || 0 }
    }

    token = tag(xml, "IsTruncated") === "true" ? tag(xml, "NextContinuationToken") : null
  } while (token)
}

const kb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB || "LexVert" })
const db = mongoose.connection.db

// Every collection that owns a private-bucket key. A key present in any of them
// is live; anything else under a non-skipped prefix is unreferenced.
const OWNERS = ["vaultdocuments", "corpusdocuments", "contractreviews", "attachments"]

const referenced = new Set()
for (const name of OWNERS) {
  const rows = await db.collection(name).find({}, { projection: { r2Key: 1 } }).toArray()
  for (const row of rows) if (row.r2Key) referenced.add(row.r2Key)
  console.log(`  ${name.padEnd(20)} ${rows.length} rows`)
}
console.log(`\n${referenced.size} referenced keys\n`)

let total = 0
let orphanBytes = 0
const orphans = []

for await (const obj of listObjects()) {
  total++
  if (SKIP_PREFIXES.some((p) => obj.key.startsWith(p))) continue
  if (referenced.has(obj.key)) continue
  orphans.push(obj)
  orphanBytes += obj.size
}

console.log(`scanned ${total} objects`)
console.log(`orphans ${orphans.length}  (${kb(orphanBytes)})\n`)
for (const o of orphans.slice(0, 50)) console.log(`  ${kb(o.size).padStart(9)}  ${o.key}`)
if (orphans.length > 50) console.log(`  ... and ${orphans.length - 50} more`)

if (!DELETE) {
  console.log(`\nDry run. Re-run with --delete to remove these ${orphans.length} objects.`)
} else {
  let deleted = 0
  for (const o of orphans) {
    const res = await client.fetch(`${endpoint}/${o.key}`, { method: "DELETE" })
    if (res.ok || res.status === 404) deleted++
    else console.error(`  failed HTTP ${res.status}  ${o.key}`)
  }
  console.log(`\ndeleted ${deleted}/${orphans.length} objects, reclaimed ${kb(orphanBytes)}`)
}

await mongoose.disconnect()
