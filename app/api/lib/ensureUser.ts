import { clerkClient } from "@clerk/nextjs/server";
import User from "./models/user";
import connectMongoWithRetry from "./db/connectMongo";

/**
 * Ensures the authenticated Clerk user exists in MongoDB.
 * If the user doesn't exist (e.g. webhook missed), creates them automatically.
 * Returns the MongoDB user document, or null if connection fails.
 */
export async function ensureUser(clerkUserId: string) {
  await connectMongoWithRetry();

  // Check if user already exists
  let user = await User.findOne({ clerkUid: clerkUserId });

  if (!user) {
    try {
      // In Clerk v6+, clerkClient is a function that returns the client
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(clerkUserId);

      user = await User.create({
        clerkUid: clerkUser.id,
        firstName: clerkUser.firstName || "",
        lastName: clerkUser.lastName || "",
        email: clerkUser.emailAddresses?.[0]?.emailAddress || null,
        cases: [],
        clients: [],
        subscription: {
          plan: "free",
          status: "active",
          billingCycle: "monthly",
          cancelAtPeriodEnd: false,
        },
      });
    } catch (error) {
      console.error("[ENSURE_USER] Failed to fetch Clerk user or create MongoDB record");
      // Create a minimal user entry with just the Clerk ID
      user = await User.create({
        clerkUid: clerkUserId,
        firstName: "",
        lastName: "",
        email: null,
        cases: [],
        clients: [],
        subscription: {
          plan: "free",
          status: "active",
          billingCycle: "monthly",
          cancelAtPeriodEnd: false,
        },
      });
    }
  }

  return user;
}
