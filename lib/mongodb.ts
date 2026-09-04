/**
 * Canonical entry point for the shared MongoDB connection.
 *
 * The implementation lives in app/api/lib/db/connectMongo.ts, which holds the one
 * globally cached connection; this module only re-exports it so there is a single
 * connection and a single cache, no matter which path a caller imports from.
 */
export { connectDB, default } from "@/app/api/lib/db/connectMongo";
