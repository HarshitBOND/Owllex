import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import { ensureUser } from "@/app/api/lib/ensureUser"
import Transaction from "@/app/api/lib/models/transaction"
import User from "@/app/api/lib/models/user"
import {
  convertMinorToMajorAmount,
  getStripeCheckoutBaseUrl,
  getStripeClient,
  getStripePriceId,
} from "@/app/api/lib/services/stripe"

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

const withSessionIdPlaceholder = (urlPath: string) =>
  urlPath.includes("?")
    ? `${urlPath}&session_id={CHECKOUT_SESSION_ID}`
    : `${urlPath}?session_id={CHECKOUT_SESSION_ID}`

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
    }

    const parsedBody = checkoutPayloadSchema.safeParse(body)
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0]?.message || "Invalid checkout payload"
      return NextResponse.json({ success: false, error: issue }, { status: 400 })
    }

    const stripe = getStripeClient()
    if (!stripe) {
      return NextResponse.json(
        {
          success: false,
          error: "Stripe is not configured. Add STRIPE_SECRET_KEY and plan price IDs to environment.",
        },
        { status: 500 },
      )
    }

    const selectedPriceId = getStripePriceId(parsedBody.data.plan, parsedBody.data.billingCycle)
    if (!selectedPriceId) {
      return NextResponse.json(
        {
          success: false,
          error: "Selected plan is not configured for Stripe checkout.",
        },
        { status: 400 },
      )
    }

    await connectMongoWithRetry()
    await ensureUser(userId)

    const user = await User.findOne({ clerkUid: userId }).select("_id email").lean().exec()
    if (!user?._id) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    const price = await stripe.prices.retrieve(selectedPriceId)

    const amount = convertMinorToMajorAmount(price.unit_amount) || 0
    const currency = (price.currency || "inr").toUpperCase()

    const transaction = await Transaction.create({
      userId: user._id,
      amount,
      status: "pending",
      paymentGateway: "stripe",
      description: `Subscription checkout: ${parsedBody.data.plan} (${parsedBody.data.billingCycle})`,
      currency,
      metadata: {
        type: "subscription-checkout",
        plan: parsedBody.data.plan,
        billingCycle: parsedBody.data.billingCycle,
        stripePriceId: selectedPriceId,
      },
    })

    const baseUrl = getStripeCheckoutBaseUrl()
    const successPath = normalizePath(parsedBody.data.successPath, "/dashboard?billing=success")
    const cancelPath = normalizePath(parsedBody.data.cancelPath, "/dashboard?billing=cancelled")

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: selectedPriceId, quantity: 1 }],
      success_url: `${baseUrl}${withSessionIdPlaceholder(successPath)}`,
      cancel_url: `${baseUrl}${cancelPath}`,
      client_reference_id: userId,
      customer_email: (user as any).email || undefined,
      metadata: {
        clerkUid: userId,
        plan: parsedBody.data.plan,
        billingCycle: parsedBody.data.billingCycle,
        transactionId: transaction._id.toString(),
      },
      subscription_data: {
        metadata: {
          clerkUid: userId,
          plan: parsedBody.data.plan,
          billingCycle: parsedBody.data.billingCycle,
          transactionId: transaction._id.toString(),
        },
      },
      allow_promotion_codes: true,
    })

    transaction.checkoutSessionId = session.id
    transaction.metadata = {
      ...(transaction.metadata || {}),
      stripeCheckoutSessionId: session.id,
      stripeCheckoutUrl: session.url,
    }
    await transaction.save()

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      checkoutUrl: session.url,
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
