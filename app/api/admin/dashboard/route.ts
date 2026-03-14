/**
 * GET /api/admin/dashboard
 * Returns admin dashboard statistics:
 * - total users, total transactions, total revenue, total documents
 * - recent users, recent transactions
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/app/api/lib/adminMiddleware";
import connectMongo from "@/app/api/lib/db/connectMongo";
import User from "@/app/api/lib/models/user";
import Transaction from "@/app/api/lib/models/transaction";
import Document from "@/app/api/lib/models/document";
import AdminLog from "@/app/api/lib/models/admin-log";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  await connectMongo();

  const [
    totalUsers,
    totalTransactions,
    revenueResult,
    totalDocuments,
    recentUsers,
    recentTransactions,
    totalAdminLogs,
    activeUsers,
    bannedUsers,
    pendingTransactions,
  ] = await Promise.all([
    User.countDocuments(),
    Transaction.countDocuments(),
    Transaction.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Document.countDocuments(),
    User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("firstName lastName email role isBanned createdAt")
      .lean(),
    Transaction.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("userId", "firstName lastName email")
      .lean(),
    AdminLog.countDocuments(),
    User.countDocuments({ isBanned: { $ne: true } }),
    User.countDocuments({ isBanned: true }),
    Transaction.countDocuments({ status: "pending" }),
  ]);

  const totalRevenue = revenueResult[0]?.total || 0;

  await logAdminAction(admin.dbUserId, "viewed_dashboard", request, {
    targetType: "system",
    details: "Viewed admin dashboard",
  });

  return NextResponse.json({
    success: true,
    stats: {
      totalUsers,
      totalTransactions,
      totalRevenue,
      totalDocuments,
      totalAdminLogs,
      activeUsers,
      bannedUsers,
      pendingTransactions,
    },
    recentUsers,
    recentTransactions,
  });
}
