import Stripe from "stripe"
import { NextRequest, NextResponse } from "next/server"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import SimpleInvoice from "@/app/api/lib/models/simple-invoice"
import Transaction from "@/app/api/lib/models/transaction"
import User from "@/app/api/lib/models/user"
import {
  activateUserSubscriptionFromPayment,
  markUserSubscriptionPastDue,
  SubscriptionBillingCycle,
  SubscriptionPlan,
} from "@/app/api/lib/services/subscription"
import {
  convertMinorToMajorAmount,
  getStripeClient,
  getStripeWebhookSecret,
} from "@/app/api/lib/services/stripe"

const isSubscriptionPlan = (value: unknown): value is SubscriptionPlan =>
  value === "free" || value === "starter" || value === "professional" || value === "enterprise"

const isBillingCycle = (value: unknown): value is SubscriptionBillingCycle =>
  value === "monthly" || value === "yearly"

const toStringOrNull = (value: unknown) => (typeof value === "string" && value.trim() ? value : null)

const toDateFromUnix = (value?: number | null) =>
  Number.isFinite(value) && value ? new Date(Number(value) * 1000) : null

const getStripeMetadataValue = (metadata: Stripe.Metadata | null | undefined, key: string) => {
  if (!metadata) {
    return null
  }

  const value = metadata[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

const getCheckoutFailureReason = (session: Stripe.Checkout.Session) => {
  if (session.status === "expired") {
    return "Checkout session expired"
  }

  return "Checkout payment failed"
}

const getTransactionMetadataValue = (metadata: unknown, key: string) => {
  if (!metadata || typeof metadata !== "object") {
    return null
  }

  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

const updateTransactionToFailed = async ({
  transactionId,
  checkoutSessionId,
  reason,
}: {
  transactionId?: string | null
  checkoutSessionId?: string | null
  reason: string
}) => {
  const filter = transactionId
    ? { _id: transactionId }
    : checkoutSessionId
      ? { checkoutSessionId }
      : null

  if (!filter) {
    return null
  }

  return Transaction.findOneAndUpdate(
    filter,
    {
      $set: {
        status: "failed",
        failureReason: reason,
      },
    },
    { new: true },
  ).exec()
}

const handleInvoiceCheckoutCompleted = async ({
  session,
  transaction,
  paymentIntentId,
}: {
  session: Stripe.Checkout.Session
  transaction: any | null
  paymentIntentId: string | null
}) => {
  const metadata = session.metadata
  const invoiceIdFromMetadata = getStripeMetadataValue(metadata, "invoiceId")
  const invoiceIdFromTransaction = getTransactionMetadataValue(transaction?.metadata, "invoiceId")
  const invoiceId = invoiceIdFromMetadata || invoiceIdFromTransaction

  if (!invoiceId) {
    return
  }

  const invoice = await SimpleInvoice.findById(invoiceId)
  if (!invoice) {
    return
  }

  const amount =
    convertMinorToMajorAmount(session.amount_total) ||
    (typeof transaction?.amount === "number" ? Number(transaction.amount) : 0)

  if (amount <= 0) {
    return
  }

  const paymentReference = paymentIntentId || toStringOrNull(session.payment_intent) || session.id
  const paymentAlreadyRecorded = Array.isArray(invoice.payments)
    ? invoice.payments.some((payment: any) => payment.reference === paymentReference)
    : false

  if (!paymentAlreadyRecorded) {
    invoice.payments = Array.isArray(invoice.payments) ? invoice.payments : []
    invoice.payments.push({
      amount,
      method: "credit_card",
      date: new Date(),
      reference: paymentReference,
      notes: "Paid via Stripe checkout",
      createdAt: new Date(),
    })

    const currentPaidAmount = Number(invoice.paidAmount || 0)
    const totalAmount = Number(invoice.total || 0)
    invoice.paidAmount = Math.min(Number((currentPaidAmount + amount).toFixed(2)), totalAmount)
  }

  const now = new Date()
  const totalAmount = Number(invoice.total || 0)
  const paidAmount = Number(invoice.paidAmount || 0)

  if (paidAmount >= totalAmount) {
    invoice.status = "paid"
  } else if (new Date(invoice.dueDate).getTime() < now.getTime()) {
    invoice.status = "overdue"
  } else if (invoice.status === "draft") {
    invoice.status = "pending"
  }

  invoice.updatedAt = now
  await invoice.save()
}

const handleCheckoutCompleted = async (stripe: Stripe, session: Stripe.Checkout.Session) => {
  const metadata = session.metadata
  const transactionId = getStripeMetadataValue(metadata, "transactionId")
  const clerkUid =
    getStripeMetadataValue(metadata, "clerkUid") || toStringOrNull(session.client_reference_id)
  const plan = getStripeMetadataValue(metadata, "plan")
  const billingCycle = getStripeMetadataValue(metadata, "billingCycle")
  const paymentType = getStripeMetadataValue(metadata, "paymentType")

  const transaction = transactionId
    ? await Transaction.findById(transactionId)
    : await Transaction.findOne({ checkoutSessionId: session.id }).exec()

  let paymentIntentId: string | null = null
  let gatewayTransactionId: string | null = null
  let receiptUrl: string | null = null

  if (typeof session.payment_intent === "string") {
    const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent, {
      expand: ["latest_charge"],
    })

    paymentIntentId = paymentIntent.id
    gatewayTransactionId = paymentIntent.id

    const latestCharge =
      paymentIntent.latest_charge && typeof paymentIntent.latest_charge !== "string"
        ? paymentIntent.latest_charge
        : null
    receiptUrl = latestCharge?.receipt_url || null
  }

  let invoiceUrl: string | null = null
  let renewalDate: Date | null = null

  if (typeof session.invoice === "string") {
    const invoice = await stripe.invoices.retrieve(session.invoice)
    invoiceUrl = invoice.hosted_invoice_url || invoice.invoice_pdf || null

    const periodEnd = invoice.lines?.data?.[0]?.period?.end
    renewalDate = toDateFromUnix(periodEnd)
  }

  if (transaction) {
    transaction.status = "completed"
    transaction.checkoutSessionId = session.id
    transaction.subscriptionId = toStringOrNull(session.subscription)
    transaction.customerId = toStringOrNull(session.customer)
    transaction.paymentIntentId = paymentIntentId
    transaction.gatewayTransactionId = gatewayTransactionId || session.id
    transaction.failureReason = ""
    transaction.receiptUrl = receiptUrl
    transaction.invoiceUrl = invoiceUrl

    const amount = convertMinorToMajorAmount(session.amount_total)
    if (amount !== null) {
      transaction.amount = amount
    }

    if (session.currency) {
      transaction.currency = session.currency.toUpperCase()
    }

    transaction.metadata = {
      ...(transaction.metadata || {}),
      stripeCheckoutSessionId: session.id,
      stripeSubscriptionId: toStringOrNull(session.subscription),
      stripeCustomerId: toStringOrNull(session.customer),
    }

    await transaction.save()
  }

  if (paymentType === "invoice") {
    await handleInvoiceCheckoutCompleted({
      session,
      transaction,
      paymentIntentId,
    })
    return
  }

  if (clerkUid && plan && billingCycle && isSubscriptionPlan(plan) && isBillingCycle(billingCycle)) {
    const stripePriceId = transaction?.metadata?.stripePriceId || null

    await activateUserSubscriptionFromPayment(clerkUid, {
      plan,
      billingCycle,
      stripeCustomerId: toStringOrNull(session.customer),
      stripeSubscriptionId: toStringOrNull(session.subscription),
      stripePriceId: typeof stripePriceId === "string" ? stripePriceId : null,
      renewalDate,
    })
  }
}

const handleCheckoutFailure = async (session: Stripe.Checkout.Session) => {
  const metadata = session.metadata
  const transactionId = getStripeMetadataValue(metadata, "transactionId")
  const clerkUid =
    getStripeMetadataValue(metadata, "clerkUid") || toStringOrNull(session.client_reference_id)
  const paymentType = getStripeMetadataValue(metadata, "paymentType")
  const reason = getCheckoutFailureReason(session)

  await updateTransactionToFailed({
    transactionId,
    checkoutSessionId: session.id,
    reason,
  })

  if (clerkUid && paymentType !== "invoice") {
    await markUserSubscriptionPastDue(clerkUid, reason)
  }
}

const handleInvoicePaymentFailed = async (invoice: Stripe.Invoice) => {
  const subscriptionId = toStringOrNull(invoice.subscription)
  const failureReason =
    invoice.last_finalization_error?.message ||
    invoice.payment_settings?.payment_method_options?.card?.request_three_d_secure ||
    "Subscription payment failed"

  if (!subscriptionId) {
    return
  }

  const user = await User.findOne({ "subscription.stripeSubscriptionId": subscriptionId })
    .select("_id clerkUid")
    .lean()
    .exec()

  if (user?._id) {
    const amount = convertMinorToMajorAmount(invoice.amount_due)

    await Transaction.create({
      userId: user._id,
      amount: amount || 0,
      status: "failed",
      paymentGateway: "stripe",
      gatewayTransactionId: invoice.id,
      subscriptionId,
      customerId: toStringOrNull(invoice.customer),
      paymentIntentId: toStringOrNull(invoice.payment_intent),
      invoiceUrl: invoice.hosted_invoice_url || invoice.invoice_pdf || null,
      failureReason,
      description: "Subscription renewal payment failed",
      currency: (invoice.currency || "inr").toUpperCase(),
      metadata: {
        type: "subscription-renewal",
        stripeInvoiceId: invoice.id,
      },
    })
  }

  if (user?.clerkUid) {
    await markUserSubscriptionPastDue(user.clerkUid, failureReason)
  }
}

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripeClient()
    const webhookSecret = getStripeWebhookSecret()

    if (!stripe || !webhookSecret) {
      return NextResponse.json(
        { success: false, error: "Stripe webhook is not configured" },
        { status: 500 },
      )
    }

    const signature = request.headers.get("stripe-signature")
    if (!signature) {
      return NextResponse.json({ success: false, error: "Missing stripe-signature" }, { status: 400 })
    }

    const payload = await request.text()
    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret)
    } catch (error) {
      console.error("Stripe webhook signature verification failed:", error)
      return NextResponse.json({ success: false, error: "Invalid webhook signature" }, { status: 400 })
    }

    await connectMongoWithRetry()

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(stripe, event.data.object as Stripe.Checkout.Session)
        break
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await handleCheckoutFailure(event.data.object as Stripe.Checkout.Session)
        break
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break
      default:
        break
    }

    return NextResponse.json({ success: true, received: true })
  } catch (error) {
    console.error("Stripe webhook handler error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to process Stripe webhook" },
      { status: 500 },
    )
  }
}
