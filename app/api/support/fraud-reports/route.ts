import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import {
  parsePagination,
  sanitizeQuery,
} from "@/app/api/lib/adminMiddleware";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import FraudReport from "@/app/api/lib/models/fraud-report";
import { requireSupport } from "@/app/api/lib/supportMiddleware";

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const STATUS_VALUES = [
  "new",
  "under_review",
  "investigating",
  "resolved",
  "dismissed",
] as const;

type FraudStatus = (typeof STATUS_VALUES)[number];

function isFraudStatus(status: string): status is FraudStatus {
  return STATUS_VALUES.includes(status as FraudStatus);
}

export async function GET(request: NextRequest) {
  const support = await requireSupport(request);
  if (support instanceof NextResponse) return support;

  await connectMongoWithRetry();

  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = parsePagination(searchParams);
  const search = sanitizeQuery(searchParams.get("search") || "");
  const statusFilter = (searchParams.get("status") || "").trim();

  const query: Record<string, unknown> = {};

  if (statusFilter && isFraudStatus(statusFilter)) {
    query.status = statusFilter;
  }

  if (search) {
    const safeSearch = escapeRegexLiteral(search);
    query.$or = [
      { name: { $regex: safeSearch, $options: "i" } },
      { email: { $regex: safeSearch, $options: "i" } },
      { incidentTitle: { $regex: safeSearch, $options: "i" } },
      { incidentDetails: { $regex: safeSearch, $options: "i" } },
      { caseReference: { $regex: safeSearch, $options: "i" } },
    ];
  }

  const [reports, total, groupedCounts] = await Promise.all([
    FraudReport.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        "name email phone incidentTitle incidentDetails incidentDate caseReference amountInvolved priority evidenceUrls status resolutionNotes createdAt updatedAt handledAt",
      )
      .lean(),
    FraudReport.countDocuments(query),
    FraudReport.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const counts: Record<FraudStatus, number> & { total: number } = {
    new: 0,
    under_review: 0,
    investigating: 0,
    resolved: 0,
    dismissed: 0,
    total: 0,
  };

  groupedCounts.forEach((entryRaw) => {
    const entry = entryRaw as { _id: string; count: number };

    if (isFraudStatus(entry._id)) {
      counts[entry._id] = Number(entry.count) || 0;
      counts.total += Number(entry.count) || 0;
    }
  });

  return NextResponse.json({
    success: true,
    reports,
    counts,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

export async function PATCH(request: NextRequest) {
  const support = await requireSupport(request);
  if (support instanceof NextResponse) return support;

  await connectMongoWithRetry();

  const body = (await request.json().catch(() => ({}))) as {
    reportId?: string;
    status?: string;
    resolutionNotes?: string;
  };

  const reportId = (body.reportId || "").trim();
  const status = (body.status || "").trim();
  const resolutionNotes = (body.resolutionNotes || "").trim();

  if (!Types.ObjectId.isValid(reportId)) {
    return NextResponse.json(
      { success: false, error: "Valid reportId is required" },
      { status: 400 },
    );
  }

  if (!isFraudStatus(status)) {
    return NextResponse.json(
      {
        success: false,
        error: "Valid status is required",
      },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = {
    status,
    resolutionNotes,
  };

  if (status === "new") {
    update.handledBy = null;
    update.handledAt = null;
  } else {
    update.handledBy = support.dbUserId;
    update.handledAt = new Date();
  }

  const updated = await FraudReport.findByIdAndUpdate(
    reportId,
    { $set: update },
    { new: true },
  )
    .select(
      "name email phone incidentTitle incidentDetails incidentDate caseReference amountInvolved priority evidenceUrls status resolutionNotes createdAt updatedAt handledAt",
    )
    .lean();

  if (!updated) {
    return NextResponse.json(
      { success: false, error: "Fraud report not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    report: updated,
  });
}
