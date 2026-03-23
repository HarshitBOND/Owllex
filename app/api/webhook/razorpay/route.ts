import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import SimpleInvoice from "@/app/api/lib/models/simple-invoice"
import Transaction from "@/app/api/lib/models/transaction"
import {
  activateUserSubscriptionFromPayment,
  markUserSubscriptionPastDue,
  SubscriptionBillingCycle,
  SubscriptionPlan,
} from "@/app/api/lib/services/subscription"
import {
  convertMinorToMajorAmount,
  getRazorpayWebhookSecret,
} from "@/app/api/lib/services/razorpay"

const isSubscriptionPlan = (value: unknown): value is SubscriptionPlan =>
  value === "free" || value === "starter" || value === "professional" || value === "enterprise"

const isBillingCycle = (value: unknown): value is SubscriptionBillingCycle =>
  value === "monthly" || value === "yearly"

const toStringOrNull = (value: unknown) => (typeof value === "string" && value.trim() ? value : null)

const getMetadataValue = (metadata: unknown, key: string) => {
  if (!metadata || typeof metadata !== "object") {
    return null
  }

  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

const verifyWebhookSignature = ({
  payload,
  signature,
  secret,
}: {
  payload: string
  signature: string
  secret: string
}) => {
  const expectedSignature = crypto.createHmac("sha256", secret).update(payload).digest("hex")
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
}

const resolveInvoiceMethod = (method: string | null) => {
  switch (method) {
    case "upi":
      return "upi"
    case "card":
      return "credit_card"
    case "netbanking":
      return "bank_transfer"
    case "wallet":
      return "other"
    default:
      return "other"
  }
}

const getPaymentFailureReason = (payment: Record<string, unknown>) => {
  return (
    toStringOrNull(payment.error_description) ||
    toStringOrNull(payment.error_reason) ||
    toStringOrNull(payment.error_source) ||
    "Payment failed"
  )
}

const resolveTransaction = async ({
  transactionId,
  paymentLinkId,
  paymentId,
}: {
  transactionId: string | null
  paymentLinkId: string | null
  paymentId: string | null
}) => {
  if (transactionId) {
    const transaction = await Transaction.findById(transactionId).exec()
    if (transaction) {
      return transaction
    }
  }

  const orFilters: Array<Record<string, unknown>> = []

  if (paymentLinkId) {
    orFilters.push(
      { checkoutSessionId: paymentLinkId },
      { "metadata.razorpayPaymentLinkId": paymentLinkId },
    )
  }

  if (paymentId) {
    orFilters.push({ gatewayTransactionId: paymentId })
  }

  if (orFilters.length === 0) {
    return null
  }

  return Transaction.findOne({ $or: orFilters }).exec()
}

const getEventData = (webhookBody: Record<string, unknown>) => {
  const payload = (webhookBody.payload || {}) as Record<string, unknown>
  const payment = ((payload.payment || {}) as Record<string, unknown>).entity as
    | Record<string, unknown>
    | undefined
  const paymentLink = ((payload.payment_link || {}) as Record<string, unknown>).entity as
    | Record<string, unknown>
    | undefined

  const notes =
    (payment && typeof payment.notes === "object" ? (payment.notes as Record<string, unknown>) : null) ||
    (paymentLink && typeof paymentLink.notes === "object"
      ? (paymentLink.notes as Record<string, unknown>)
      : null) ||
    {}

  const paymentId = toStringOrNull(payment?.id)
  const paymentLinkId =
    toStringOrNull(payment?.payment_link_id) || toStringOrNull(paymentLink?.id) || null

  return {
    payment,
    notes,
    paymentId,
    paymentLinkId,
  }
}

const handleInvoicePaymentCompleted = async ({
  payment,
  transaction,
  notes,
}: {
  payment: Record<string, unknown>
  transaction: any | null
  notes: Record<string, unknown>
}) => {
  const invoiceId =
    toStringOrNull(notes.invoiceId) || getMetadataValue(transaction?.metadata, "invoiceId") || null

  if (!invoiceId) {
    return
  }

  const invoice = await SimpleInvoice.findById(invoiceId)
  if (!invoice) {
    return
  }

  const amount =
    convertMinorToMajorAmount(
      typeof payment.amount === "number" ? payment.amount : Number(payment.amount || 0),
    ) || (typeof transaction?.amount === "number" ? Number(transaction.amount) : 0)

  if (amount <= 0) {
    return
  }

  const paymentReference = toStringOrNull(payment.id) || transaction?.gatewayTransactionId || null
  if (!paymentReference) {
    return
  }

  const paymentAlreadyRecorded = Array.isArray(invoice.payments)
    ? invoice.payments.some((entry: any) => entry.reference === paymentReference)
    : false

  if (!paymentAlreadyRecorded) {
    invoice.payments = Array.isArray(invoice.payments) ? invoice.payments : []
    invoice.payments.push({
      amount,
      method: resolveInvoiceMethod(toStringOrNull(payment.method)),
      date: new Date(),
      reference: paymentReference,
      notes: "Paid via Razorpay",
      createdAt: new Date(),
    })

    const currentPaidAmount = Number(invoice.paidAmount || 0)
    const totalAmount = Number(invoice.total || 0)
    invoice.paidAmount = Math.min(Number((currentPaidAmount + amount).toFixed(2)), totalAmount)
  }

  const totalAmount = Number(invoice.total || 0)
  const paidAmount = Number(invoice.paidAmount || 0)
  const now = new Date()

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

const handlePaymentCaptured = async (webhookBody: Record<string, unknown>) => {
  const { payment, notes, paymentId, paymentLinkId } = getEventData(webhookBody)

  if (!payment) {
    return
  }

  const transactionId = toStringOrNull(notes.transactionId)
  const transaction = await resolveTransaction({ transactionId, paymentLinkId, paymentId })

  if (transaction) {
    const amount = convertMinorToMajorAmount(
      typeof payment.amount === "number" ? payment.amount : Number(payment.amount || 0),
    )
    const currency = (toStringOrNull(payment.currency) || "INR").toUpperCase()

    transaction.status = "completed"
    transaction.paymentGateway = "razorpay"
    transaction.gatewayTransactionId = paymentId || transaction.gatewayTransactionId || null
    transaction.checkoutSessionId =
      transaction.checkoutSessionId || paymentLinkId || transaction.checkoutSessionId || null
    transaction.failureReason = ""
    transaction.currency = currency

    if (amount !== null) {
      transaction.amount = amount
    }

    transaction.metadata = {
      ...(transaction.metadata || {}),
      razorpayPaymentId: paymentId,
      razorpayPaymentLinkId: paymentLinkId,
      razorpayOrderId: toStringOrNull(payment.order_id),
      razorpayMethod: toStringOrNull(payment.method),
    }

    await transaction.save()
  }

  const paymentType =
    toStringOrNull(notes.paymentType) ||
    getMetadataValue(transaction?.metadata, "paymentType") ||
    (getMetadataValue(transaction?.metadata, "type") === "invoice-payment" ? "invoice" : "subscription")

  if (paymentType === "invoice") {
    await handleInvoicePaymentCompleted({
      payment,
      transaction,
      notes,
    })
    return
  }

  const clerkUid = toStringOrNull(notes.clerkUid) || getMetadataValue(transaction?.metadata, "clerkUid")
  const plan = toStringOrNull(notes.plan) || getMetadataValue(transaction?.metadata, "plan")
  const billingCycle =
    toStringOrNull(notes.billingCycle) || getMetadataValue(transaction?.metadata, "billingCycle")

  if (clerkUid && plan && billingCycle && isSubscriptionPlan(plan) && isBillingCycle(billingCycle)) {
    await activateUserSubscriptionFromPayment(clerkUid, {
      plan,
      billingCycle,
    })
  }
}

const handlePaymentFailed = async (webhookBody: Record<string, unknown>) => {
  const { payment, notes, paymentId, paymentLinkId } = getEventData(webhookBody)
  if (!payment) {
    return
  }

  const transactionId = toStringOrNull(notes.transactionId)
  const transaction = await resolveTransaction({ transactionId, paymentLinkId, paymentId })
  const failureReason = getPaymentFailureReason(payment)

  if (transaction) {
    transaction.status = "failed"
    transaction.paymentGateway = "razorpay"
    transaction.gatewayTransactionId = paymentId || transaction.gatewayTransactionId || null
    transaction.failureReason = failureReason
    transaction.metadata = {
      ...(transaction.metadata || {}),
      razorpayPaymentId: paymentId,
      razorpayPaymentLinkId: paymentLinkId,
      razorpayOrderId: toStringOrNull(payment.order_id),
    }
    await transaction.save()
  }

  const paymentType =
    toStringOrNull(notes.paymentType) ||
    getMetadataValue(transaction?.metadata, "paymentType") ||
    (getMetadataValue(transaction?.metadata, "type") === "invoice-payment" ? "invoice" : "subscription")

  if (paymentType === "invoice") {
    return
  }

  const clerkUid = toStringOrNull(notes.clerkUid) || getMetadataValue(transaction?.metadata, "clerkUid")
  if (clerkUid) {
    await markUserSubscriptionPastDue(clerkUid, failureReason)
  }
}

export async function POST(request: NextRequest) {
  try {
    const webhookSecret = getRazorpayWebhookSecret()
    if (!webhookSecret) {
      return NextResponse.json(
        { success: false, error: "Razorpay webhook is not configured" },
        { status: 500 },
      )
    }

    const signature = request.headers.get("x-razorpay-signature")
    if (!signature) {
      return NextResponse.json(
        { success: false, error: "Missing x-razorpay-signature" },
        { status: 400 },
      )
    }

    const payload = await request.text()
    if (!verifyWebhookSignature({ payload, signature, secret: webhookSecret })) {
      return NextResponse.json({ success: false, error: "Invalid webhook signature" }, { status: 400 })
    }

    const webhookBody = (JSON.parse(payload) || {}) as Record<string, unknown>
    const event = toStringOrNull(webhookBody.event)

    await connectMongoWithRetry()

    switch (event) {
      case "payment.captured":
      case "payment_link.paid":
      case "order.paid":
        await handlePaymentCaptured(webhookBody)
        break
      case "payment.failed":
        await handlePaymentFailed(webhookBody)
        break
      default:
        break
    }

    return NextResponse.json({ success: true, received: true })
  } catch (error) {
    console.error("Razorpay webhook handler error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to process Razorpay webhook" },
      { status: 500 },
    )
  }
}
