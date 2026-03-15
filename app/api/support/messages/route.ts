import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import {
  parsePagination,
  sanitizeQuery,
} from "@/app/api/lib/adminMiddleware";
import connectMongo from "@/app/api/lib/db/connectMongo";
import Complaint from "@/app/api/lib/models/complaint";
import { requireSupport } from "@/app/api/lib/supportMiddleware";

const STATUS_VALUES = ["new", "in_progress", "resolved"] as const;
type SupportStatus = (typeof STATUS_VALUES)[number];

function isSupportStatus(status: string): status is SupportStatus {
  return STATUS_VALUES.includes(status as SupportStatus);
}

export async function GET(request: NextRequest) {
  const support = await requireSupport(request);
  if (support instanceof NextResponse) return support;

  await connectMongo();

  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = parsePagination(searchParams);
  const search = sanitizeQuery(searchParams.get("search") || "");
  const statusFilter = (searchParams.get("status") || "").trim();

  const query: Record<string, unknown> = {};

  if (statusFilter && isSupportStatus(statusFilter)) {
    query.status = statusFilter;
  }

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { subject: { $regex: search, $options: "i" } },
      { message: { $regex: search, $options: "i" } },
    ];
  }

  const [messages, total, groupedCounts] = await Promise.all([
    Complaint.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("name email subject message status createdAt updatedAt handledAt")
      .lean(),
    Complaint.countDocuments(query),
    Complaint.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const counts = {
    new: 0,
    in_progress: 0,
    resolved: 0,
    total: 0,
  };

  groupedCounts.forEach((entryRaw) => {
    const entry = entryRaw as { _id: string; count: number };

    if (isSupportStatus(entry._id)) {
      counts[entry._id] = Number(entry.count) || 0;
      counts.total += Number(entry.count) || 0;
    }
  });

  return NextResponse.json({
    success: true,
    messages,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    counts,
  });
}

export async function PATCH(request: NextRequest) {
  const support = await requireSupport(request);
  if (support instanceof NextResponse) return support;

  await connectMongo();

  const body = (await request.json().catch(() => ({}))) as {
    messageId?: string;
    status?: string;
  };

  const messageId = (body.messageId || "").trim();
  const status = (body.status || "").trim();

  if (!Types.ObjectId.isValid(messageId)) {
    return NextResponse.json(
      { success: false, error: "Valid messageId is required" },
      { status: 400 },
    );
  }

  if (!isSupportStatus(status)) {
    return NextResponse.json(
      {
        success: false,
        error: "Valid status is required (new, in_progress, resolved)",
      },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = {
    status,
  };

  if (status === "new") {
    update.handledBy = null;
    update.handledAt = null;
  } else {
    update.handledBy = support.dbUserId;
    update.handledAt = new Date();
  }

  const updated = await Complaint.findOneAndUpdate(
    { _id: messageId },
    { $set: update },
    { new: true },
  )
    .select("name email subject message status createdAt updatedAt handledAt")
    .lean();

  if (!updated) {
    return NextResponse.json(
      { success: false, error: "Message not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    message: updated,
  });
}
