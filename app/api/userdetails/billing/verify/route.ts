import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import Transaction from "@/app/api/lib/models/transaction"
import User from "@/app/api/lib/models/user"
import {
  activateUserSubscriptionFromPayment,
  SubscriptionBillingCycle,
  SubscriptionPlan,
} from "@/app/api/lib/services/subscription"
import { enforceRateLimit, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"

const verifyPayloadSchema = z
  .object({
    razorpay_order_id: z.string().trim().min(1),
    razorpay_payment_id: z.string().trim().min(1),
    razorpay_signature: z.string().trim().min(1),
  })
  .strict()

export async function POST(request: NextRequest) {
  try {
    const userContext = await requireUserContext(request, { allowExpiredTrial: true })
    if (userContext instanceof NextResponse) {
      return userContext
    }

    const userId = userContext.clerkUid

    const { blockedResponse } = await enforceRateLimit(request, {
      key: `billing:verify:${userId}`,
      max: 30,
      windowMs: 10 * 60 * 1000,
    })

    if (blockedResponse) {
      return blockedResponse
    }

    const parsedBody = await parseAndValidateJson(request, verifyPayloadSchema)
    if (!parsedBody.success) {
      return parsedBody.response
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim()
    if (!keySecret) {
      return NextResponse.json(
        { success: false, error: "Razorpay is not configured." },
        { status: 500 },
      )
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsedBody.data

    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex")

    const signatureBuffer = Buffer.from(razorpay_signature)
    const expectedBuffer = Buffer.from(expectedSignature)
    const signatureIsValid =
      signatureBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, expectedBuffer)

    await connectMongoWithRetry()

    const user = (await User.findOne({ clerkUid: userId }).select("_id").lean().exec()) as {
      _id?: unknown
    } | null
    if (!user?._id) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    const transaction = await Transaction.findOne({
      userId: user._id,
      paymentGateway: "razorpay",
      $or: [{ checkoutSessionId: razorpay_order_id }, { "metadata.razorpayOrderId": razorpay_order_id }],
    }).exec()

    if (!transaction) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 })
    }

    if (!signatureIsValid) {
      transaction.status = "failed"
      transaction.failureReason = "Razorpay signature verification failed"
      transaction.metadata = {
        ...(transaction.metadata || {}),
        razorpayPaymentId: razorpay_payment_id,
      }
      await transaction.save()

      return NextResponse.json(
        { success: false, error: "Payment signature verification failed" },
        { status: 400 },
      )
    }

    const plan = (transaction.metadata || {}).plan as SubscriptionPlan | undefined
    const billingCycle = (transaction.metadata || {}).billingCycle as
      | SubscriptionBillingCycle
      | undefined

    if (transaction.status !== "completed") {
      transaction.status = "completed"
      transaction.gatewayTransactionId = razorpay_payment_id
      transaction.failureReason = ""
      transaction.metadata = {
        ...(transaction.metadata || {}),
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignatureVerifiedAt: new Date().toISOString(),
      }
      await transaction.save()

      if (plan && billingCycle) {
        await activateUserSubscriptionFromPayment(userId, { plan, billingCycle })
      }
    }

    return NextResponse.json({
      success: true,
      verified: true,
      transactionId: transaction._id,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      plan: plan || null,
      billingCycle: billingCycle || null,
    })
  } catch (error) {
    console.error("Billing verify error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to verify payment" },
      { status: 500 },
    )
  }
}
