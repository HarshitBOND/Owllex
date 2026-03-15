import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import {
  parsePagination,
  sanitizeQuery,
} from "@/app/api/lib/adminMiddleware";
import connectMongo from "@/app/api/lib/db/connectMongo";
import Notification from "@/app/api/lib/models/notification";
import { requireSupport } from "@/app/api/lib/supportMiddleware";

const SUPPORT_ISSUE_STATUS = ["open", "in_progress", "resolved"] as const;
type SupportIssueStatus = (typeof SUPPORT_ISSUE_STATUS)[number];

function isSupportIssueStatus(value: string): value is SupportIssueStatus {
  return SUPPORT_ISSUE_STATUS.includes(value as SupportIssueStatus);
}

export async function GET(request: NextRequest) {
  const support = await requireSupport(request);
  if (support instanceof NextResponse) return support;

  await connectMongo();

  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = parsePagination(searchParams);
  const search = sanitizeQuery(searchParams.get("search") || "");
  const issueStatus = (searchParams.get("issueStatus") || "").trim();

  const query: Record<string, unknown> = {
    status: "failed",
  };

  if (issueStatus && isSupportIssueStatus(issueStatus)) {
    query.supportIssueStatus = issueStatus;
  }

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { message: { $regex: search, $options: "i" } },
      { caseTitle: { $regex: search, $options: "i" } },
      { emailTo: { $regex: search, $options: "i" } },
      { error: { $regex: search, $options: "i" } },
    ];
  }

  const [issues, total, groupedCounts] = await Promise.all([
    Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        "clerkUid title message caseTitle hearingDate channel status retryCount emailTo error supportIssueStatus supportIssueNotes createdAt updatedAt",
      )
      .lean(),
    Notification.countDocuments(query),
    Notification.aggregate([
      { $match: { status: "failed" } },
      { $group: { _id: "$supportIssueStatus", count: { $sum: 1 } } },
    ]),
  ]);

  const counts: Record<SupportIssueStatus, number> & { total: number } = {
    open: 0,
    in_progress: 0,
    resolved: 0,
    total: 0,
  };

  groupedCounts.forEach((entryRaw) => {
    const entry = entryRaw as { _id: string; count: number };

    if (isSupportIssueStatus(entry._id)) {
      counts[entry._id] = Number(entry.count) || 0;
      counts.total += Number(entry.count) || 0;
    }
  });

  return NextResponse.json({
    success: true,
    issues,
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

  await connectMongo();

  const body = (await request.json().catch(() => ({}))) as {
    notificationId?: string;
    action?: "retry" | "update-status";
    supportIssueStatus?: string;
    supportIssueNotes?: string;
  };

  const notificationId = (body.notificationId || "").trim();
  const action = body.action;
  const supportIssueStatus = (body.supportIssueStatus || "").trim();
  const supportIssueNotes = (body.supportIssueNotes || "").trim();

  if (!Types.ObjectId.isValid(notificationId)) {
    return NextResponse.json(
      { success: false, error: "Valid notificationId is required" },
      { status: 400 },
    );
  }

  if (action !== "retry" && action !== "update-status") {
    return NextResponse.json(
      { success: false, error: "Valid action is required" },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = {
    supportIssueNotes,
    supportIssueHandledBy: support.dbUserId,
    supportIssueHandledAt: new Date(),
  };

  if (action === "retry") {
    update.status = "pending";
    update.retryCount = 0;
    update.nextRetryAt = new Date();
    update.error = null;
    update.supportIssueStatus = "in_progress";
  } else {
    if (!isSupportIssueStatus(supportIssueStatus)) {
      return NextResponse.json(
        { success: false, error: "Valid supportIssueStatus is required" },
        { status: 400 },
      );
    }

    update.supportIssueStatus = supportIssueStatus;
  }

  const updated = await Notification.findOneAndUpdate(
    { _id: notificationId, status: "failed" },
    { $set: update },
    { new: true },
  )
    .select(
      "clerkUid title message caseTitle hearingDate channel status retryCount emailTo error supportIssueStatus supportIssueNotes createdAt updatedAt",
    )
    .lean();

  if (!updated) {
    return NextResponse.json(
      { success: false, error: "Failed notification not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    issue: updated,
  });
}
