import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectMongoWithRetry from "../lib/db/connectMongo";
import User from "../lib/models/user";

/**
 * TEST ENDPOINT - Check current authentication and MongoDB status
 * GET /api/test-auth
 */
export async function GET(req: NextRequest) {
  try {
    console.log("\n=== TEST AUTH ENDPOINT ===");

    // 1. Check Clerk auth
    const { userId } = await auth();
    console.log("✓ Clerk auth checked. userId:", userId);

    if (!userId) {
      return NextResponse.json(
        { error: "Not authenticated. Please log in first." },
        { status: 401 }
      );
    }

    // 2. Connect to MongoDB
    console.log("Connecting to MongoDB...");
    await connectMongoWithRetry();
    console.log("✓ MongoDB connected");

    // 3. Check if user exists
    const user = await User.findOne({ clerkUid: userId });
    console.log("User lookup result:", user ? "FOUND ✓" : "NOT FOUND ✗");

    if (user) {
      console.log("User data:", {
        _id: user._id,
        clerkUid: user.clerkUid,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        createdAt: user.createdAt,
      });

      return NextResponse.json({
        status: "✓ SUCCESS",
        message: "User found in MongoDB!",
        user: {
          id: user._id,
          clerkUid: user.clerkUid,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          createdAt: user.createdAt,
        },
      });
    } else {
      return NextResponse.json(
        {
          status: "✗ ERROR",
          message: "User NOT found in MongoDB. Webhook may not have fired.",
          debugInfo: {
            userId,
            message: "The webhook from Clerk did not create this user. Check Clerk dashboard webhook configuration.",
          },
        },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error("Test auth error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
