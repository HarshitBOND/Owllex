/**
 * Admin authentication helper (legacy — kept for backwards compatibility).
 * New code should use adminMiddleware.ts instead.
 *
 * Admin is determined by:
 *  `role === "admin"` in the User document
 *
 * Usage in API routes:
 *   const admin = await requireAdmin();
 *   if (admin instanceof NextResponse) return admin; // 401/403
 */

import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import connectMongo from "@/app/api/lib/db/connectMongo";
import User from "@/app/api/lib/models/user";

export interface AdminUser {
  userId: string;
  email: string;
  role: string;
}

/**
 * Returns the admin user object or a NextResponse error.
 * Call at the top of any admin-only API route.
 */
export async function requireAdmin(): Promise<AdminUser | NextResponse> {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized — please sign in" },
      { status: 401 }
    );
  }

  // Get email from Clerk directly (most reliable source)
  const clerkUser = await currentUser();
  const clerkEmail = clerkUser?.emailAddresses?.[0]?.emailAddress?.toLowerCase() || "";

  await connectMongo();
  const user = await User.findOne({ clerkUid: userId }).lean();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "User not found" },
      { status: 401 }
    );
  }

  const typedUser = user as Record<string, unknown>;
  const dbEmail = ((typedUser.email as string) || "").toLowerCase();
  const role = (typedUser.role as string) || "user";

  // Check admin by role in database only
  if (role !== "admin") {
    return NextResponse.json(
      { success: false, error: "Forbidden — admin access required" },
      { status: 403 }
    );
  }

  return { userId, email: clerkEmail || dbEmail, role };
}

/**
 * Lightweight check — returns true/false (for client-side API).
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const result = await requireAdmin();
  return !(result instanceof NextResponse);
}
