import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import Transaction from "@/app/api/lib/models/transaction"
import User from "@/app/api/lib/models/user"
import {
  convertMinorToMajorAmount,
  getRazorpayCheckoutBaseUrl,
  getRazorpayClient,
  getRazorpayPlanAmountMinor,
} from "@/app/api/lib/services/razorpay"
import { enforceRateLimit, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"

const checkoutPayloadSchema = z
  .object({
    plan: z.enum(["starter", "professional", "enterprise"]),
    billingCycle: z.enum(["monthly", "yearly"]).default("monthly"),
    successPath: z.string().trim().optional(),
    cancelPath: z.string().trim().optional(),
  })
  .strict()

const normalizePath = (path: string | undefined, fallback: string) => {
  const candidate = path?.trim() || fallback
  if (!candidate.startsWith("/")) {
    return fallback
  }

  return candidate
}

export async function POST(request: NextRequest) {
  try {
    const userContext = await requireUserContext()
    if (userContext instanceof NextResponse) {
      return userContext
    }

    const userId = userContext.clerkUid

    const { blockedResponse } = enforceRateLimit(request, {
      key: `billing:checkout:${userId}`,
      max: 15,
      windowMs: 10 * 60 * 1000,
    })

    if (blockedResponse) {
      return blockedResponse
    }

    const parsedBody = await parseAndValidateJson(request, checkoutPayloadSchema)
    if (!parsedBody.success) {
      return parsedBody.response
    }

    const razorpay = getRazorpayClient()
    if (!razorpay) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Razorpay is not configured. Add RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and plan amount env keys.",
        },
        { status: 500 },
      )
    }

    const selectedAmountMinor = getRazorpayPlanAmountMinor(
      parsedBody.data.plan,
      parsedBody.data.billingCycle,
    )
    if (!selectedAmountMinor) {
      return NextResponse.json(
        {
          success: false,
          error: "Selected plan is not configured for Razorpay checkout.",
        },
        { status: 400 },
      )
    }

    await connectMongoWithRetry()

    const user = (await User.findOne({ clerkUid: userId }).select("_id email").lean().exec()) as {
      _id?: unknown
      email?: string | null
    } | null
    if (!user?._id) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    const amount = convertMinorToMajorAmount(selectedAmountMinor) || 0
    const currency = "INR"

    const transaction = await Transaction.create({
      userId: user._id,
      amount,
      status: "pending",
      paymentGateway: "razorpay",
      description: `Subscription checkout: ${parsedBody.data.plan} (${parsedBody.data.billingCycle})`,
      currency,
      metadata: {
        type: "subscription-checkout",
        plan: parsedBody.data.plan,
        billingCycle: parsedBody.data.billingCycle,
        razorpayAmountMinor: selectedAmountMinor,
      },
    })

    const baseUrl = getRazorpayCheckoutBaseUrl()
    const successPath = normalizePath(parsedBody.data.successPath, "/dashboard?billing=success")
    const cancelPath = normalizePath(parsedBody.data.cancelPath, "/dashboard?billing=cancelled")

    const paymentLink = await razorpay.paymentLink.create({
      amount: selectedAmountMinor,
      currency,
      accept_partial: false,
      description: `LexVert ${parsedBody.data.plan} (${parsedBody.data.billingCycle}) subscription`,
      callback_url: `${baseUrl}${successPath}`,
      callback_method: "get",
      notify: {
        email: Boolean(user.email),
        sms: false,
      },
      customer: user.email
        ? {
            email: user.email,
          }
        : undefined,
      notes: {
        paymentType: "subscription",
        clerkUid: userId,
        plan: parsedBody.data.plan,
        billingCycle: parsedBody.data.billingCycle,
        transactionId: transaction._id.toString(),
      },
    })

    const checkoutUrl = paymentLink.short_url || null
    if (!checkoutUrl) {
      throw new Error("Razorpay payment link URL was not returned")
    }

    transaction.checkoutSessionId = paymentLink.id
    transaction.metadata = {
      ...(transaction.metadata || {}),
      razorpayPaymentLinkId: paymentLink.id,
      razorpayPaymentLinkUrl: checkoutUrl,
      cancelPath,
    }
    await transaction.save()

    return NextResponse.json({
      success: true,
      sessionId: paymentLink.id,
      checkoutUrl,
      transactionId: transaction._id,
      plan: parsedBody.data.plan,
      billingCycle: parsedBody.data.billingCycle,
      amount,
      currency,
    })
  } catch (error) {
    console.error("Billing checkout error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create checkout session" },
      { status: 500 },
    )
  }
}
