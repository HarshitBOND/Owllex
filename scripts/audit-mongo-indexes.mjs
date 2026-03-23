import mongoose from "mongoose"

const mongoUri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB || "LexVert"

if (!mongoUri) {
  console.error("MONGODB_URI is required to run index audit")
  process.exit(1)
}

const collectionsToAudit = [
  "users",
  "cases",
  "clients",
  "tasks",
  "simpleinvoices",
  "notifications",
  "transactions",
  "scraped_cases",
  "downloaded_pdfs",
  "scraper_logs",
  "firms",
  "teammemberships",
  "jobruns",
]

const printIndexes = async () => {
  await mongoose.connect(mongoUri, {
    dbName,
  })

  try {
    const db = mongoose.connection.db

    console.log(`Mongo index audit for database: ${dbName}`)

    for (const collectionName of collectionsToAudit) {
      const collection = db.collection(collectionName)

      try {
        const indexes = await collection.indexes()
        console.log(`\n[${collectionName}]`)

        if (!indexes || indexes.length === 0) {
          console.log("  (no indexes)")
          continue
        }

        for (const index of indexes) {
          const name = index.name || "(unnamed)"
          const key = JSON.stringify(index.key || {})
          const unique = index.unique ? " unique" : ""
          console.log(`  - ${name}: ${key}${unique}`)
        }
      } catch (error) {
        console.log(`\n[${collectionName}]`)
        console.log(`  Unable to read indexes: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  } finally {
    await mongoose.disconnect()
  }
}

printIndexes().catch((error) => {
  console.error("Index audit failed:", error)
  process.exit(1)
})
