/**
 * Gives every pre-existing document template a version-1 snapshot.
 *
 * Template content moved out of the family record and into immutable
 * DocumentTemplateVersion rows so that drafts can pin the version they were
 * started on. Templates created before that change have nothing to pin to, so
 * this writes each one's current body as version 1 and leaves it rendering
 * exactly as it does today.
 *
 * Idempotent: a template that already has a version 1 is skipped, so it is safe
 * to re-run and safe to run against a partially migrated database.
 *
 *   npx tsx scripts/backfill-template-versions.ts
 */
import path from "node:path"
import { config as loadEnv } from "dotenv"
import mongoose from "mongoose"
import { connectDB } from "../app/api/lib/db/connectMongo"

loadEnv({ path: path.resolve(process.cwd(), ".env.local") })

const { MONGODB_URI, MONGODB_DB } = process.env

if (!MONGODB_URI) {
  console.error("Missing required env var MONGODB_URI")
  process.exit(1)
}

async function main() {
  await connectDB()
  const db = mongoose.connection.db!

  const templates = db.collection("documenttemplates")
  const versions = db.collection("documenttemplateversions")

  await versions.createIndex({ templateId: 1, version: -1 }, { unique: true })

  const rows = await templates.find({}).toArray()
  let created = 0
  let skipped = 0

  for (const row of rows) {
    const existing = await versions.findOne({ templateId: row._id, version: 1 })
    if (existing) {
      skipped++
      continue
    }

    const now = new Date()
    await versions.insertOne({
      templateId: row._id,
      version: 1,
      bodyHtml: row.bodyHtml || "",
      // No fields: these bodies use literal underscores for their blanks, so
      // there is nothing to fill and nothing to ask. They open straight in the
      // editor exactly as they always have.
      fields: [],
      sourcePdf: null,
      renderMode: "html",
      changeNote: "Backfilled from the template as it stood before versioning.",
      createdBy: row.createdBy,
      publishedAt: row.publishedAt || now,
      createdAt: row.createdAt || now,
      updatedAt: now,
    })

    await templates.updateOne(
      { _id: row._id },
      {
        $set: {
          latestVersion: Math.max(1, Number(row.latestVersion) || 1),
          fields: Array.isArray(row.fields) ? row.fields : [],
          supersededBy: row.supersededBy ?? null,
        },
      }
    )

    created++
    console.log(`v1 created: ${row.title} (${row.slug})`)
  }

  console.log(`\n${created} backfilled, ${skipped} already had a version 1.`)
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
