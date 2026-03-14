import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUser } from "../../lib/ensureUser";

/**
 * POST /api/userdetails/sync
 * Ensures the current Clerk user exists in MongoDB.
 * Call this after login to guarantee the user record is created,
 * even if the Clerk webhook was not configured or failed.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    console.log("[SYNC] User sync called for userId:", userId);

    if (!userId) {
      console.error("[SYNC] No userId found, returning 401");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
