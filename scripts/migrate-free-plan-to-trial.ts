/**
 * Renames the "free" subscription plan to "trial" on existing user records.
 *
 * The plan value itself was renamed (see app/api/lib/services/subscription.ts)
 * so the pricing page can stop presenting a permanently-free tier and instead
 * frame it as the 7-day trial it always was. Users already on "free" need
 * their stored plan value updated to match the new enum, or they'd fail
 * Mongoose schema validation on their next save.
 *
 * Idempotent: only touches documents still on "free", so it's safe to re-run.
 *
 *   npx tsx scripts/migrate-free-plan-to-trial.ts
 */
import path from "node:path"
import { config as loadEnv } from "dotenv"
import mongoose from "mongoose"
import { connectDB } from "../app/api/lib/db/connectMongo"

loadEnv({ path: path.resolve(process.cwd(), ".env.local") })

const { MONGODB_URI } = process.env

if (!MONGODB_URI) {
  console.error("Missing required env var MONGODB_URI")
  process.exit(1)
}

async function main() {
  await connectDB()
  const db = mongoose.connection.db!
  const users = db.collection("users")

  const result = await users.updateMany(
    { "subscription.plan": "free" },
    { $set: { "subscription.plan": "trial" } },
  )

  console.log(`${result.modifiedCount} user(s) migrated from plan "free" to "trial".`)
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
