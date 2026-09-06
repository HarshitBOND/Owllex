/**
 * GET /api/admin/ai-usage?days=30
 *
 * Spend breakdown from the AiUsageEvent collection.
 *
 * That collection has been written on every recorded model call all along, and
 * nothing ever read it -- which is why a surprising bill could not be explained
 * from inside the app. Everything here is aggregated in Mongo rather than
 * pulled into the route, because the collection holds one document per model
 * call.
 *
 * Note the collection's own 90-day TTL: `days` beyond that returns what
 * survives, not the true total.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, logAdminAction } from "@/app/api/lib/adminMiddleware"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import AiUsageEvent from "@/app/api/lib/models/ai-usage-event"
import User from "@/app/api/lib/models/user"

const MAX_DAYS = 90

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (admin instanceof NextResponse) return admin

  const requestedDays = Number(request.nextUrl.searchParams.get("days") ?? 30)
  const days = Number.isFinite(requestedDays)
    ? Math.min(Math.max(Math.trunc(requestedDays), 1), MAX_DAYS)
    : 30

  await connectMongoWithRetry()

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const match = { $match: { createdAt: { $gte: since } } }

  // Shared by the feature and model breakdowns: the same measures, grouped by
  // a different key.
  const measures = {
    costPaise: { $sum: "$costPaise" },
    calls: { $sum: 1 },
    inputTokens: { $sum: "$inputTokens" },
    outputTokens: { $sum: "$outputTokens" },
    cachedInputTokens: { $sum: "$cachedInputTokens" },
  }

  const [totals, byFeature, byModel, byDay, topUsers] = await Promise.all([
    AiUsageEvent.aggregate([match, { $group: { _id: null, ...measures } }]),
    AiUsageEvent.aggregate([
      match,
      { $group: { _id: "$feature", ...measures } },
      { $sort: { costPaise: -1 } },
    ]),
    AiUsageEvent.aggregate([
      match,
      { $group: { _id: "$modelKey", ...measures } },
      { $sort: { costPaise: -1 } },
    ]),
    AiUsageEvent.aggregate([
      match,
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          ...measures,
        },
      },
      { $sort: { _id: 1 } },
    ]),
    AiUsageEvent.aggregate([
      match,
      { $group: { _id: "$clerkUid", costPaise: { $sum: "$costPaise" }, calls: { $sum: 1 } } },
      { $sort: { costPaise: -1 } },
      { $limit: 10 },
    ]),
  ])

  // Resolved separately rather than with a $lookup: clerkUid is an external id,
  // not a ref, and there are at most ten of them.
  const users = await User.find({ clerkUid: { $in: topUsers.map((u) => u._id) } })
    .select("clerkUid email firstName lastName")
    .lean<{ clerkUid: string; email?: string; firstName?: string; lastName?: string }[]>()
  const userByUid = new Map(users.map((u) => [u.clerkUid, u]))

  const total = totals[0] ?? {
    costPaise: 0,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
  }

  // The share of input tokens billed at the cached rate, which is a tenth of
  // the normal one. This is the number that says whether the prompt-caching
  // work is actually landing: a route that changes its system prompt every turn
  // sits near zero, and a regression shows up here before it shows up on an
  // invoice.
  const cacheHitRatio =
    total.inputTokens > 0 ? total.cachedInputTokens / total.inputTokens : 0

  await logAdminAction(admin.dbUserId, "viewed_ai_usage", request, {
    targetType: "system",
    details: `Viewed AI spend breakdown for the last ${days} days`,
  })

  return NextResponse.json({
    success: true,
    days,
    totals: { ...total, cacheHitRatio },
    byFeature: byFeature.map((row) => ({ feature: row._id ?? "unknown", ...row, _id: undefined })),
    byModel: byModel.map((row) => ({ modelKey: row._id ?? "unknown", ...row, _id: undefined })),
    byDay: byDay.map((row) => ({ date: row._id, ...row, _id: undefined })),
    topUsers: topUsers.map((row) => {
      const user = userByUid.get(row._id)
      return {
        clerkUid: row._id,
        label:
          [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
          user?.email ||
          row._id,
        costPaise: row.costPaise,
        calls: row.calls,
      }
    }),
  })
}
