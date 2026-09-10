/**
 * Recompresses every PDF already sitting in the vault and overwrites it in place.
 *
 * New uploads are compressed by app/api/lib/storage/compressPdf.ts as they
 * arrive. This is what runs that same pass over everything uploaded before it
 * existed -- which, because compression used to depend on a Python service that
 * was never reachable, is very likely every PDF in the vault.
 *
 * It imports the real compressor rather than reimplementing it, so a dry run
 * previews exactly what --apply would store. The previous version shelled out to
 * Ghostscript for the preview and called the backend for the apply, so the two
 * could disagree; neither dependency is needed any more.
 *
 * The storage key is content-addressed to the *original* upload bytes (see
 * app/api/lib/storage/dedupe.ts), so recompression overwrites the same key --
 * no new object, and no Mongo changes besides sha256/size/compressionStatus.
 *
 * Objects live on the mounted volume behind the backend now rather than in R2,
 * so this talks to the same storage module the routes use. It therefore needs
 * the backend reachable and BACKEND_INTERNAL_TOKEN set, not bucket credentials.
 *
 * This is lossy and irreversible, same as a fresh upload: only the currently
 * stored bytes are recompressed, so anything already recompressed once will be
 * recompressed again. Dry run is the default.
 *
 *   npm run vault:recompress
 *   npm run vault:recompress -- --apply
 */
import { createHash } from "node:crypto"
import path from "node:path"
import { config as loadEnv } from "dotenv"
import mongoose from "mongoose"
import { connectDB } from "../app/api/lib/db/connectMongo"
import { compressPdf } from "../app/api/lib/storage/compressPdf"
import { getPrivateObject, putPrivateObject } from "../app/api/lib/storage/hddStorage"

// Plain `node` doesn't auto-load .env.local the way Next's dev/build commands
// do -- without this every var below reads as missing even though it's sitting
// right there in the file. A pre-existing shell export still wins.
loadEnv({ path: path.resolve(process.cwd(), ".env.local") })

const APPLY = process.argv.includes("--apply")

const { MONGODB_URI, BACKEND_INTERNAL_TOKEN } = process.env

for (const [name, value] of Object.entries({ MONGODB_URI, BACKEND_INTERNAL_TOKEN })) {
  if (!value) {
    console.error(`Missing required env var ${name}`)
    process.exit(1)
  }
}

async function getObject(key: string): Promise<Buffer | null> {
  const object = await getPrivateObject(key)
  return object.ok && object.body ? object.body : null
}

async function putObject(key: string, body: Buffer, contentType: string): Promise<boolean> {
  try {
    await putPrivateObject(key, body, contentType)
    return true
  } catch (error) {
    console.error(`  write failed: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`

async function main() {
  await connectDB()
  const db = mongoose.connection.db!

  const docs = await db
    .collection("vaultdocuments")
    .find({ $or: [{ mimeType: "application/pdf" }, { filename: /\.pdf$/i }] })
    .project({ filename: 1, mimeType: 1, size: 1, r2Key: 1 })
    .toArray()

  console.log(`${docs.length} PDF documents in the vault${APPLY ? "" : " (dry run -- nothing will be written)"}\n`)

  let scanned = 0
  let recompressed = 0
  let skippedNoGain = 0
  let failed = 0
  let bytesBefore = 0
  let bytesAfter = 0

  for (const doc of docs) {
    scanned++
    const bytes = await getObject(doc.r2Key)
    if (!bytes) {
      failed++
      console.error(`  missing in R2    ${doc.r2Key}`)
      continue
    }

    const before = bytes.byteLength
    const result = await compressPdf(bytes)

    if (!result.compressed) {
      skippedNoGain++
      console.log(`  no gain (${result.reason})  ${doc.filename}`)
      continue
    }

    const after = result.storedBytes
    bytesBefore += before
    bytesAfter += after
    recompressed++
    console.log(
      `  ${mb(before).padStart(9)} -> ${mb(after).padStart(9)}  (-${(100 * (1 - after / before)).toFixed(0)}%)  ${doc.filename}`
    )

    if (APPLY) {
      const contentType = doc.mimeType || "application/pdf"
      if (!(await putObject(doc.r2Key, result.buffer, contentType))) {
        failed++
        recompressed--
        bytesBefore -= before
        bytesAfter -= after
        console.error(`  R2 write failed  ${doc.r2Key}`)
        continue
      }

      // sha256 has to be updated in the same breath as the bytes, or the verify
      // endpoint will read the new object against the old hash and call it
      // corrupted.
      await db.collection("vaultdocuments").updateOne(
        { _id: doc._id },
        {
          $set: {
            sha256: createHash("sha256").update(result.buffer).digest("hex"),
            size: after,
            verifyStatus: "verified",
            lastVerifiedAt: new Date(),
            compressionStatus: "compressed",
            compressionReason: "",
          },
        }
      )
    }
  }

  console.log(`\nscanned ${scanned}, recompressed ${recompressed}, no gain ${skippedNoGain}, failed ${failed}`)
  if (recompressed > 0) {
    console.log(
      `${mb(bytesBefore)} -> ${mb(bytesAfter)} across recompressed files (-${(100 * (1 - bytesAfter / bytesBefore)).toFixed(0)}%)`
    )
  }
  if (!APPLY && recompressed > 0) console.log("\nDry run. Re-run with --apply to write these.")

  await mongoose.disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
