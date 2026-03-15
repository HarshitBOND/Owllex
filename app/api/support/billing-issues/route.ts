import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import {
  parsePagination,
  sanitizeQuery,
} from "@/app/api/lib/adminMiddleware";
import connectMongo from "@/app/api/lib/db/connectMongo";
import Transaction from "@/app/api/lib/models/transaction";
import { requireSupport } from "@/app/api/lib/supportMiddleware";

const SUPPORT_ISSUE_STATUS = ["open", "in_progress", "resolved"] as const;
type SupportIssueStatus = (typeof SUPPORT_ISSUE_STATUS)[number];

function isSupportIssueStatus(value: string): value is SupportIssueStatus {
  return SUPPORT_ISSUE_STATUS.includes(value as SupportIssueStatus);
}

const billingIssueBaseQuery = {
  $or: [
    { status: "failed" },
    { failureReason: { $exists: true, $ne: "" } },
  ],
};

export async function GET(request: NextRequest) {
  const support = await requireSupport(request);
  if (support instanceof NextResponse) return support;

  await connectMongo();

  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = parsePagination(searchParams);
  const search = sanitizeQuery(searchParams.get("search") || "");
  const issueStatus = (searchParams.get("issueStatus") || "").trim();

  const query: Record<string, unknown> = {
    ...billingIssueBaseQuery,
  };

  if (issueStatus && isSupportIssueStatus(issueStatus)) {
    query.supportIssueStatus = issueStatus;
  }

  if (search) {
    query.$and = [
      {
        $or: [
          { gatewayTransactionId: { $regex: search, $options: "i" } },
          { checkoutSessionId: { $regex: search, $options: "i" } },
          { failureReason: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ],
      },
    ];
  }

  const [issues, total, groupedCounts] = await Promise.all([
    Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        "userId amount currency status paymentGateway gatewayTransactionId checkoutSessionId receiptUrl invoiceUrl failureReason description supportIssueStatus supportIssueNotes createdAt updatedAt",
      )
      .lean(),
    Transaction.countDocuments(query),
    Transaction.aggregate([
      { $match: billingIssueBaseQuery },
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
    transactionId?: string;
    supportIssueStatus?: string;
    supportIssueNotes?: string;
  };

  const transactionId = (body.transactionId || "").trim();
  const supportIssueStatus = (body.supportIssueStatus || "").trim();
  const supportIssueNotes = (body.supportIssueNotes || "").trim();

  if (!Types.ObjectId.isValid(transactionId)) {
    return NextResponse.json(
      { success: false, error: "Valid transactionId is required" },
      { status: 400 },
    );
  }

  if (!isSupportIssueStatus(supportIssueStatus)) {
    return NextResponse.json(
      { success: false, error: "Valid supportIssueStatus is required" },
      { status: 400 },
    );
  }

  const updated = await Transaction.findOneAndUpdate(
    {
      _id: transactionId,
      ...billingIssueBaseQuery,
    },
    {
      $set: {
        supportIssueStatus,
        supportIssueNotes,
        supportIssueHandledBy: support.dbUserId,
        supportIssueHandledAt: new Date(),
      },
    },
    { new: true },
  )
    .select(
      "userId amount currency status paymentGateway gatewayTransactionId checkoutSessionId receiptUrl invoiceUrl failureReason description supportIssueStatus supportIssueNotes createdAt updatedAt",
    )
    .lean();

  if (!updated) {
    return NextResponse.json(
      { success: false, error: "Billing issue transaction not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    issue: updated,
  });
}
