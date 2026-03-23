import { NextRequest, NextResponse } from "next/server"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import Transaction from "@/app/api/lib/models/transaction"
import User from "@/app/api/lib/models/user"
import { enforceRateLimit, requireUserContext } from "@/app/api/lib/routeGuards"

const parseLimit = (rawValue: string | null) => {
  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20
  }

  return Math.min(parsed, 100)
}

export async function GET(request: NextRequest) {
  try {
    const userContext = await requireUserContext()
    if (userContext instanceof NextResponse) {
      return userContext
    }

    const userId = userContext.clerkUid

    const { blockedResponse } = enforceRateLimit(request, {
      key: `billing:transactions:${userId}`,
      max: 120,
      windowMs: 10 * 60 * 1000,
    })

    if (blockedResponse) {
      return blockedResponse
    }

    await connectMongoWithRetry()

    const user = (await User.findOne({ clerkUid: userId }).select("_id").lean().exec()) as {
      _id?: unknown
    } | null
    if (!user?._id) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseLimit(searchParams.get("limit"))

    const transactions = await Transaction.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec()

    return NextResponse.json({ success: true, transactions, limit })
  } catch (error) {
    console.error("Billing transactions GET error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to load billing transactions" },
      { status: 500 },
    )
  }
}
