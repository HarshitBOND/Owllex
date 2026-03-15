import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import {
  parsePagination,
  sanitizeQuery,
} from "@/app/api/lib/adminMiddleware";
import connectMongo from "@/app/api/lib/db/connectMongo";
import Suggestion from "@/app/api/lib/models/suggestion";
import { requireSupport } from "@/app/api/lib/supportMiddleware";

const STATUS_VALUES = ["pending", "approved", "rejected"] as const;
type SuggestionStatus = (typeof STATUS_VALUES)[number];

const updateSuggestionSchema = z.object({
  suggestionId: z.string().trim().min(1),
  status: z.enum(STATUS_VALUES),
  adminNotes: z.string().trim().max(1000).optional(),
});

const isSuggestionStatus = (value: string): value is SuggestionStatus => {
  return STATUS_VALUES.includes(value as SuggestionStatus);
};

export async function GET(request: NextRequest) {
  const support = await requireSupport(request);
  if (support instanceof NextResponse) return support;

  await connectMongo();

  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = parsePagination(searchParams);
  const search = sanitizeQuery(searchParams.get("search") || "");
  const statusFilter = (searchParams.get("status") || "").trim();

  const query: Record<string, unknown> = {};

  if (statusFilter && isSuggestionStatus(statusFilter)) {
    query.status = statusFilter;
  }

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { category: { $regex: search, $options: "i" } },
      { submitterName: { $regex: search, $options: "i" } },
      { submitterEmail: { $regex: search, $options: "i" } },
    ];
  }

  const [suggestions, total, groupedCounts] = await Promise.all([
    Suggestion.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        "title description category status adminNotes ratingAverage ratingCount submitterName submitterEmail createdAt updatedAt",
      )
      .lean(),
    Suggestion.countDocuments(query),
    Suggestion.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const counts = {
    pending: 0,
    approved: 0,
    rejected: 0,
    total: 0,
  };

  groupedCounts.forEach((entryRaw) => {
    const entry = entryRaw as { _id: string; count: number };
    if (isSuggestionStatus(entry._id)) {
      counts[entry._id] = Number(entry.count) || 0;
      counts.total += Number(entry.count) || 0;
    }
  });

  return NextResponse.json({
    success: true,
    suggestions,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    counts,
  });
}

export async function PATCH(request: NextRequest) {
  const support = await requireSupport(request);
  if (support instanceof NextResponse) return support;

  await connectMongo();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = updateSuggestionSchema.safeParse(body);
  if (!parsedBody.success) {
    const firstIssue = parsedBody.error.issues[0]?.message || "Invalid suggestion review payload";
    return NextResponse.json({ success: false, error: firstIssue }, { status: 400 });
  }

  const { suggestionId, status, adminNotes } = parsedBody.data;

  if (!Types.ObjectId.isValid(suggestionId)) {
    return NextResponse.json({ success: false, error: "Valid suggestionId is required" }, { status: 400 });
  }

  const updated = await Suggestion.findByIdAndUpdate(
    suggestionId,
    {
      $set: {
        status,
        adminNotes: adminNotes || "",
      },
    },
    { new: true },
  )
    .select(
      "title description category status adminNotes ratingAverage ratingCount submitterName submitterEmail createdAt updatedAt",
    )
    .lean();

  if (!updated) {
    return NextResponse.json({ success: false, error: "Suggestion not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    suggestion: updated,
    reviewedBy: support.email,
  });
}
