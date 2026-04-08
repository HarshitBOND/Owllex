/**
 * GET /api/admin/documents
 * List generated documents with search, filters, and pagination.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAdmin,
  logAdminAction,
  sanitizeQuery,
  parsePagination,
} from "@/app/api/lib/adminMiddleware";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import Document from "@/app/api/lib/models/document";

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
  const typeFilter = sanitizeQuery(searchParams.get("type") || "");

  const query: Record<string, unknown> = {};

  if (search) {
    const safeSearch = escapeRegexLiteral(search);
    query.$or = [
      { title: { $regex: safeSearch, $options: "i" } },
      { filePath: { $regex: safeSearch, $options: "i" } },
    ];
  }

  if (
    typeFilter &&
    ["affidavit", "invoice", "legal_notice", "contract", "report", "other"].includes(typeFilter)
  ) {
    query.documentType = typeFilter;
  }

  const [documents, total] = await Promise.all([
    Document.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "firstName lastName email")
      .lean(),
    Document.countDocuments(query),
  ]);

  await logAdminAction(admin.dbUserId, "viewed_documents", request, {
    targetType: "document",
    details: `Listed documents page=${page}`,
  });

  return NextResponse.json({
    success: true,
    documents,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
