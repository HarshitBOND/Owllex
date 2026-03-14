import { clerkClient } from "@clerk/nextjs/server";
import User from "./models/user";
import connectMongoWithRetry from "./db/connectMongo";

/**
 * Ensures the authenticated Clerk user exists in MongoDB.
 * If the user doesn't exist (e.g. webhook missed), creates them automatically.
 * Returns the MongoDB user document, or null if connection fails.
 */
export async function ensureUser(clerkUserId: string) {
  console.log("[ENSURE_USER] Checking if user exists for clerkUid:", clerkUserId);
  await connectMongoWithRetry();

  // Check if user already exists
  let user = await User.findOne({ clerkUid: clerkUserId });
  console.log("[ENSURE_USER] User lookup result:", user ? "found" : "not found");

  if (!user) {
    console.log("[ENSURE_USER] User not found, fetching from Clerk...");
    try {
      // In Clerk v6+, clerkClient is a function that returns the client
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(clerkUserId);
      console.log("[ENSURE_USER] Clerk user fetched:", clerkUser.id, clerkUser.firstName, clerkUser.lastName, clerkUser.emailAddresses?.[0]?.emailAddress);

      user = await User.create({
        clerkUid: clerkUser.id,
        firstName: clerkUser.firstName || "",
        lastName: clerkUser.lastName || "",
        email: clerkUser.emailAddresses?.[0]?.emailAddress || null,
        cases: [],
        clients: [],
      });

      console.log(`[ENSURE_USER] Auto-created MongoDB user for clerkUid: ${clerkUser.id}, MongoID: ${user._id}`);
    } catch (error) {
      console.error(`[ENSURE_USER] Failed to fetch Clerk user or create MongoDB record:`, error);
      // Create a minimal user entry with just the Clerk ID
      user = await User.create({
        clerkUid: clerkUserId,
        firstName: "",
        lastName: "",
        email: null,
        cases: [],
        clients: [],
      });
      console.log(`[ENSURE_USER] Created minimal MongoDB user for clerkUid: ${clerkUserId}, MongoID: ${user._id}`);
    }
  }

  return user;
}
