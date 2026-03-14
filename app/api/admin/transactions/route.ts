/**
 * GET /api/admin/transactions
 * List transactions with search, filters, and pagination.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAdmin,
  logAdminAction,
  sanitizeQuery,
  parsePagination,
} from "@/app/api/lib/adminMiddleware";
import connectMongo from "@/app/api/lib/db/connectMongo";
import Transaction from "@/app/api/lib/models/transaction";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  await connectMongo();

  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = parsePagination(searchParams);
  const statusFilter = sanitizeQuery(searchParams.get("status") || "");
  const gatewayFilter = sanitizeQuery(searchParams.get("gateway") || "");
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";

  const query: Record<string, unknown> = {};

  if (statusFilter && ["pending", "completed", "failed", "refunded"].includes(statusFilter)) {
    query.status = statusFilter;
  }

  if (gatewayFilter && ["stripe", "razorpay", "paypal", "manual"].includes(gatewayFilter)) {
    query.paymentGateway = gatewayFilter;
  }

  if (dateFrom || dateTo) {
    const dateQuery: Record<string, Date> = {};
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!isNaN(from.getTime())) dateQuery.$gte = from;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      if (!isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        dateQuery.$lte = to;
      }
    }
    if (Object.keys(dateQuery).length > 0) {
      query.createdAt = dateQuery;
    }
  }

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "firstName lastName email")
      .lean(),
    Transaction.countDocuments(query),
  ]);

  await logAdminAction(admin.dbUserId, "viewed_transactions", request, {
    targetType: "transaction",
    details: `Listed transactions page=${page}`,
  });

  return NextResponse.json({
    success: true,
    transactions,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
