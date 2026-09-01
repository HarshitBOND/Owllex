/**
 * Admin middleware for Next.js API routes.
 *
 * Verifies:
 *  1. User is authenticated via Clerk
 *  2. User has role === "admin" in the database
 *  3. User is not banned
 *
 * Logs every admin action to AdminLog collection.
 */

import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import User from "@/app/api/lib/models/user";
import AdminLog from "@/app/api/lib/models/admin-log";
import { applyRateLimit, getRateLimitIdentity } from "@/app/api/lib/rateLimit";
import { logSecurityEvent } from "@/app/api/lib/securityLogger";

export interface AdminUser {
  userId: string;
  dbUserId: string;
  email: string;
  role: string;
}

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute

/**
 * Verifies the current user is an authenticated admin.
 * Returns the admin user object or a NextResponse error.
 */
export async function requireAdmin(
  request?: NextRequest
): Promise<AdminUser | NextResponse> {
  const { userId } = await auth();

  if (!userId) {
    logSecurityEvent({
      type: "admin_access_attempt",
      level: "warn",
      message: "Admin route access denied: unauthenticated",
      request,
    });
    return NextResponse.json(
      { success: false, error: "Unauthorized please sign in" },
      { status: 401 }
    );
  }

  const syntheticRequest = request || new NextRequest("http://localhost/api/admin/rate-limit");
  const rateLimit = await applyRateLimit({
    request: syntheticRequest,
    key: getRateLimitIdentity(syntheticRequest, `admin:${userId}`),
    max: RATE_LIMIT_MAX,
    windowMs: RATE_LIMIT_WINDOW,
  });

  if (!rateLimit.allowed) {
    logSecurityEvent({
      type: "admin_access_attempt",
      level: "warn",
      message: "Admin route access denied: rate limited",
      request: syntheticRequest,
      userId,
    });
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  const clerkUser = await currentUser();
  const clerkEmail =
    clerkUser?.emailAddresses?.[0]?.emailAddress?.toLowerCase() || "";

  await connectMongoWithRetry();
  const user = await User.findOne({ clerkUid: userId }).lean();

  if (!user) {
    logSecurityEvent({
      type: "admin_access_attempt",
      level: "warn",
      message: "Admin route access denied: user record not found",
      request,
      userId,
    });
    return NextResponse.json(
      { success: false, error: "User not found" },
      { status: 401 }
    );
  }

  const typedUser = user as Record<string, unknown>;
  const dbEmail = ((typedUser.email as string) || "").toLowerCase();
  const role = (typedUser.role as string) || "user";
  const isBanned = (typedUser.isBanned as boolean) || false;
  const dbUserId = String(typedUser._id);

  if (isBanned) {
    logSecurityEvent({
      type: "admin_access_attempt",
      level: "warn",
      message: "Admin route access denied: banned account",
      request,
      userId,
    });
    return NextResponse.json(
      { success: false, error: "Account is suspended" },
      { status: 403 }
    );
  }

  // Admin check role must be "admin" in the database
  if (role !== "admin") {
    logSecurityEvent({
      type: "admin_access_attempt",
      level: "warn",
      message: "Admin route access denied: missing admin role",
      request,
      userId,
      details: { role },
    });
    return NextResponse.json(
      { success: false, error: "Forbidden admin access required" },
      { status: 403 }
    );
  }

  return {
    userId,
    dbUserId,
    email: clerkEmail || dbEmail,
    role,
  };
}

/**
 * Lightweight admin check returns true/false.
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const result = await requireAdmin();
  return !(result instanceof NextResponse);
}

/**
 * Log an admin action to the AdminLog collection.
 */
export async function logAdminAction(
  adminDbId: string,
  action: string,
  request?: NextRequest,
  options?: {
    targetType?: "user" | "transaction" | "document" | "system" | "auth";
    targetId?: string;
    details?: string;
  }
) {
  try {
    await connectMongoWithRetry();

    const ipAddress =
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request?.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = request?.headers.get("user-agent") || "";

    await AdminLog.create({
      adminId: adminDbId,
      action,
      targetType: options?.targetType || "system",
      targetId: options?.targetId || null,
      details: options?.details || "",
      ipAddress,
      userAgent,
    });
  } catch (error) {
    console.error("Failed to log admin action:", error);
  }
}

/**
 * Sanitize a search query to prevent NoSQL injection.
 */
export function sanitizeQuery(input: string): string {
  if (!input || typeof input !== "string") return "";
  // Remove MongoDB operators and special regex chars
  return input.replace(/[${}()\\]/g, "").trim().slice(0, 200);
}

/**
 * Validate and parse pagination parameters.
 */
export function parsePagination(
  searchParams: URLSearchParams
): { page: number; limit: number; skip: number } {
  let page = parseInt(searchParams.get("page") || "1", 10);
  let limit = parseInt(searchParams.get("limit") || "20", 10);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;

  return { page, limit, skip: (page - 1) * limit };
}
