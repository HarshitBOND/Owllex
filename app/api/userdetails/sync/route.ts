import { NextResponse } from "next/server";
import { requireUserContext } from "@/app/api/lib/routeGuards";
import { ensureUser } from "../../lib/ensureUser";

/**
 * POST /api/userdetails/sync
 * Ensures the current Clerk user exists in MongoDB.
 * Call this after login to guarantee the user record is created,
 * even if the Clerk webhook was not configured or failed.
 */
export async function POST() {
  try {
    const userContext = await requireUserContext(undefined);
    if (userContext instanceof NextResponse) {
      return userContext;
    }

    const userId = userContext.clerkUid;
    console.log("[SYNC] User sync called for userId:", userId);

    console.log("[SYNC] Calling ensureUser...");
    const user = await ensureUser(userId);
    console.log("[SYNC] ensureUser returned:", user?._id, "Email:", user?.email);

    if (!user) {
      return NextResponse.json({ error: "Failed to sync user" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user._id,
        clerkUid: user.clerkUid,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("User sync error:", error);
    return NextResponse.json({ error: "Failed to sync user" }, { status: 500 });
  }
}
