import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import { ensureUser } from "@/app/api/lib/ensureUser"
import Transaction from "@/app/api/lib/models/transaction"
import User from "@/app/api/lib/models/user"

const parseLimit = (rawValue: string | null) => {
  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20
  }

  return Math.min(parsed, 100)
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    await connectMongoWithRetry()
    await ensureUser(userId)

    const user = await User.findOne({ clerkUid: userId }).select("_id").lean().exec()
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
