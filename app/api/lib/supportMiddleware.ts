import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import connectMongo from "@/app/api/lib/db/connectMongo";
import User from "@/app/api/lib/models/user";

export interface SupportUser {
  userId: string;
  dbUserId: string;
  email: string;
  role: string;
}

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 60;

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

export async function requireSupport(
  request?: NextRequest,
): Promise<SupportUser | NextResponse> {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized — please sign in" },
      { status: 401 },
    );
  }

  if (!checkRateLimit(userId)) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  const clerkUser = await currentUser();
  const clerkEmail =
    clerkUser?.emailAddresses?.[0]?.emailAddress?.toLowerCase() || "";

  await connectMongo();
  const user = await User.findOne({ clerkUid: userId }).lean();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "User not found" },
      { status: 401 },
    );
  }

  const typedUser = user as Record<string, unknown>;
  const dbEmail = ((typedUser.email as string) || "").toLowerCase();
  const role = (typedUser.role as string) || "user";
  const isBanned = (typedUser.isBanned as boolean) || false;
  const dbUserId = String(typedUser._id);

  if (isBanned) {
    return NextResponse.json(
      { success: false, error: "Account is suspended" },
      { status: 403 },
    );
  }

  if (role !== "support" && role !== "admin") {
    return NextResponse.json(
      { success: false, error: "Forbidden — support access required" },
      { status: 403 },
    );
  }

  return {
    userId,
    dbUserId,
    email: clerkEmail || dbEmail,
    role,
  };
}

export async function isCurrentUserSupport(): Promise<boolean> {
  const result = await requireSupport();
  return !(result instanceof NextResponse);
}
