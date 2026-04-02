/**
 * GET /api/admin/logs
 * View admin activity logs and system logs with pagination.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAdmin,
  logAdminAction,
  sanitizeQuery,
  parsePagination,
} from "@/app/api/lib/adminMiddleware";
import connectMongo from "@/app/api/lib/db/connectMongo";
import AdminLog from "@/app/api/lib/models/admin-log";

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  await connectMongo();

  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = parsePagination(searchParams);
  const actionFilter = sanitizeQuery(searchParams.get("action") || "");
  const targetTypeFilter = sanitizeQuery(searchParams.get("targetType") || "");

  const query: Record<string, unknown> = {};

  if (actionFilter) {
    const safeAction = escapeRegexLiteral(actionFilter);
    query.action = { $regex: safeAction, $options: "i" };
  }

  if (
    targetTypeFilter &&
    ["user", "transaction", "document", "system", "auth"].includes(targetTypeFilter)
  ) {
    query.targetType = targetTypeFilter;
  }

  const [logs, total] = await Promise.all([
    AdminLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("adminId", "firstName lastName email")
      .lean(),
    AdminLog.countDocuments(query),
  ]);

  return NextResponse.json({
    success: true,
    logs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
