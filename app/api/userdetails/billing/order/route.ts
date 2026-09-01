import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import Transaction from "@/app/api/lib/models/transaction"
import User from "@/app/api/lib/models/user"
import {
  convertMinorToMajorAmount,
  getRazorpayClient,
  getRazorpayKeyId,
  getRazorpayPlanAmountMinor,
} from "@/app/api/lib/services/razorpay"
import { enforceRateLimit, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"

const orderPayloadSchema = z
  .object({
    plan: z.enum(["starter", "professional", "enterprise"]),
    billingCycle: z.enum(["monthly", "yearly"]).default("monthly"),
  })
  .strict()

export async function POST(request: NextRequest) {
  try {
    const userContext = await requireUserContext(request)
    if (userContext instanceof NextResponse) {
      return userContext
    }

    const userId = userContext.clerkUid

    const { blockedResponse } = await enforceRateLimit(request, {
      key: `billing:order:${userId}`,
      max: 15,
      windowMs: 10 * 60 * 1000,
    })

    if (blockedResponse) {
      return blockedResponse
    }

    const parsedBody = await parseAndValidateJson(request, orderPayloadSchema)
    if (!parsedBody.success) {
      return parsedBody.response
    }

    const razorpay = getRazorpayClient()
    if (!razorpay) {
      return NextResponse.json(
        {
          success: false,
          error: "Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
        },
        { status: 500 },
      )
    }

    const { plan, billingCycle } = parsedBody.data

    const amountMinor = getRazorpayPlanAmountMinor(plan, billingCycle)
    if (!amountMinor || amountMinor < 100) {
      return NextResponse.json(
        {
          success: false,
          error: "Selected plan is not configured for Razorpay checkout.",
        },
        { status: 400 },
      )
    }

    await connectMongoWithRetry()

    const user = (await User.findOne({ clerkUid: userId })
      .select("_id email firstName lastName")
      .lean()
      .exec()) as {
      _id?: unknown
      email?: string | null
      firstName?: string | null
      lastName?: string | null
    } | null
    if (!user?._id) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    const amount = convertMinorToMajorAmount(amountMinor) || 0
    const currency = "INR"

    const transaction = await Transaction.create({
      userId: user._id,
      amount,
      status: "pending",
      paymentGateway: "razorpay",
      description: `Subscription checkout: ${plan} (${billingCycle})`,
      currency,
      metadata: {
        type: "subscription-checkout",
        paymentType: "subscription",
        clerkUid: userId,
        plan,
        billingCycle,
        razorpayAmountMinor: amountMinor,
      },
    })

    const order = await razorpay.orders.create({
      amount: amountMinor,
      currency,
      receipt: transaction._id.toString(),
      notes: {
        paymentType: "subscription",
        clerkUid: userId,
        plan,
        billingCycle,
        transactionId: transaction._id.toString(),
      },
    })

    transaction.checkoutSessionId = order.id
    transaction.metadata = {
      ...(transaction.metadata || {}),
      razorpayOrderId: order.id,
    }
    await transaction.save()

    return NextResponse.json({
      success: true,
      orderId: order.id,
      keyId: getRazorpayKeyId(),
      amountMinor,
      amount,
      currency,
      transactionId: transaction._id,
      plan,
      billingCycle,
      prefill: {
        name: [user.firstName, user.lastName].filter(Boolean).join(" "),
        email: user.email || "",
      },
    })
  } catch (error) {
    console.error("Billing order error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create payment order" },
      { status: 500 },
    )
  }
}
