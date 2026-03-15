import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import { ensureUser } from "@/app/api/lib/ensureUser"
import {
  cancelUserSubscription,
  changeUserSubscriptionPlan,
  ensureUserSubscriptionDefaults,
  getUserSubscriptionSummary,
  renewUserSubscription,
} from "@/app/api/lib/services/subscription"

const subscriptionActionSchema = z
  .object({
    action: z.enum(["cancel", "renew", "change-plan"]),
    plan: z.enum(["free", "starter", "professional", "enterprise"]).optional(),
    billingCycle: z.enum(["monthly", "yearly"]).optional(),
  })
  .strict()

export async function GET() {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    await connectMongoWithRetry()
    await ensureUser(userId)
    await ensureUserSubscriptionDefaults(userId)

    const subscription = await getUserSubscriptionSummary(userId)
    if (!subscription) {
      return NextResponse.json({ success: false, error: "Subscription not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true, subscription })
  } catch (error) {
    console.error("Subscription GET error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to load subscription" },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
    }

    const parsedBody = subscriptionActionSchema.safeParse(body)
    if (!parsedBody.success) {
      const firstIssue = parsedBody.error.issues[0]?.message || "Invalid subscription action"
      return NextResponse.json({ success: false, error: firstIssue }, { status: 400 })
    }

    await connectMongoWithRetry()
    await ensureUser(userId)
    await ensureUserSubscriptionDefaults(userId)

    let subscription = null

    if (parsedBody.data.action === "cancel") {
      subscription = await cancelUserSubscription(userId)
    } else if (parsedBody.data.action === "renew") {
      const current = await getUserSubscriptionSummary(userId)
      if (current?.plan && current.plan !== "free") {
        return NextResponse.json(
          {
            success: false,
            error: "Paid-plan renewals must be completed through the billing checkout flow.",
          },
          { status: 403 },
        )
      }

      subscription = await renewUserSubscription(userId)
    } else {
      if (!parsedBody.data.plan) {
        return NextResponse.json(
          { success: false, error: "plan is required when action is change-plan" },
          { status: 400 },
        )
      }

      if (parsedBody.data.plan !== "free") {
        return NextResponse.json(
          {
            success: false,
            error: "Paid plans require successful checkout. Use /api/userdetails/billing/checkout.",
          },
          { status: 403 },
        )
      }

      subscription = await changeUserSubscriptionPlan(
        userId,
        parsedBody.data.plan,
        parsedBody.data.billingCycle,
      )
    }

    return NextResponse.json({ success: true, subscription })
  } catch (error) {
    console.error("Subscription PATCH error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update subscription" },
      { status: 500 },
    )
  }
}