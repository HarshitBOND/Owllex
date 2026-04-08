/**
 * GET /api/admin/users
 * List users with search and pagination.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAdmin,
  logAdminAction,
  sanitizeQuery,
  parsePagination,
} from "@/app/api/lib/adminMiddleware";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import User from "@/app/api/lib/models/user";

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  await connectMongoWithRetry();

  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = parsePagination(searchParams);
  const search = sanitizeQuery(searchParams.get("search") || "");
  const roleFilter = searchParams.get("role") || "";
  const bannedFilter = searchParams.get("banned") || "";

  // Build query
  const query: Record<string, unknown> = {};

  if (search) {
    const safeSearch = escapeRegexLiteral(search);
    query.$or = [
      { firstName: { $regex: safeSearch, $options: "i" } },
      { lastName: { $regex: safeSearch, $options: "i" } },
      { email: { $regex: safeSearch, $options: "i" } },
    ];
  }

  if (roleFilter === "admin" || roleFilter === "user" || roleFilter === "support") {
    query.role = roleFilter;
  }

  if (bannedFilter === "true") {
    query.isBanned = true;
  } else if (bannedFilter === "false") {
    query.isBanned = { $ne: true };
  }

  const [users, total] = await Promise.all([
    User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("firstName lastName email role isBanned signupDate lastLogin createdAt")
      .lean(),
    User.countDocuments(query),
  ]);

  await logAdminAction(admin.dbUserId, "viewed_users", request, {
    targetType: "user",
    details: `Listed users page=${page} search="${search}"`,
  });

  return NextResponse.json({
    success: true,
    users,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
