import { NextRequest, NextResponse } from "next/server"
import sgMail from "@sendgrid/mail"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import SimpleInvoice from "@/app/api/lib/models/simple-invoice"
import { hasValidCronSecret } from "@/app/api/lib/services/notificationRunnerAuth"
import { completeJobRun, failJobRun, startJobRun } from "@/app/api/lib/services/jobRun"
import { enforceRateLimit } from "@/app/api/lib/routeGuards"

const REMINDER_COOLDOWN_HOURS = 24

const isAuthorized = (request: NextRequest) =>
  hasValidCronSecret({
    configuredSecret: process.env.CRON_SECRET,
    secretHeader: request.headers.get("x-cron-secret"),
    authorizationHeader: request.headers.get("authorization"),
  })

const normalizeCurrency = (currency?: string | null) => (currency || "USD").toUpperCase()

const formatCurrency = (amount: number, currency = "USD") => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

const getOutstandingAmount = (invoice: any) => {
  const total = Number(invoice.total || 0)
  const paidAmount = Number(invoice.paidAmount || 0)
  return Math.max(Number((total - paidAmount).toFixed(2)), 0)
}

const getReminderConfig = () => {
  const apiKey = process.env.SENDGRID_API_KEY?.trim() || ""
  const fromEmail = process.env.NOTIFICATION_FROM_EMAIL?.trim() || ""
  const fromName = process.env.NOTIFICATION_FROM_NAME?.trim() || "LexVert"

  return {
    apiKey,
    fromEmail,
    fromName,
    isEnabled: Boolean(apiKey && fromEmail),
  }
}

const buildInvoiceLink = (invoiceId: string) => {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "")
  if (!baseUrl) {
    return null
  }

  return `${baseUrl}/invoices?id=${invoiceId}`
}

const sendOverdueReminderEmail = async ({
  invoice,
  config,
}: {
  invoice: any
  config: ReturnType<typeof getReminderConfig>
}) => {
  if (!config.isEnabled) {
    return { sent: false, reason: "sendgrid-not-configured" }
  }

  const toEmail = typeof invoice.clientEmail === "string" ? invoice.clientEmail.trim() : ""
  if (!toEmail) {
    return { sent: false, reason: "missing-client-email" }
  }

  const outstanding = getOutstandingAmount(invoice)
  if (outstanding <= 0) {
    return { sent: false, reason: "invoice-already-settled" }
  }

  const currency = normalizeCurrency(invoice.currency)
  const dueDate = new Date(invoice.dueDate)
  const invoiceLink = buildInvoiceLink(invoice._id.toString())

  sgMail.setApiKey(config.apiKey)

  const lines = [
    `Hello ${invoice.clientName || "Client"},`,
    "",
    `This is a reminder that invoice ${invoice.invoiceNumber} is overdue.`,
    `Due date: ${dueDate.toLocaleDateString("en-IN")}`,
    `Outstanding amount: ${formatCurrency(outstanding, currency)}`,
    "",
    "Please complete payment at your earliest convenience.",
  ]

  if (invoice.paymentLinkUrl) {
    lines.push(`Pay online: ${invoice.paymentLinkUrl}`)
  }

  if (invoiceLink) {
    lines.push(`View invoice: ${invoiceLink}`)
  }

  lines.push("", "Regards,", "LexVert")

  await sgMail.send({
    to: toEmail,
    from: { email: config.fromEmail, name: config.fromName },
    subject: `Overdue reminder: ${invoice.invoiceNumber}`,
    text: lines.join("\n"),
  })

  return { sent: true, reason: null }
}

const runOverdueReminderJob = async () => {
  await connectMongoWithRetry()

  const now = new Date()
  const reminderCutoff = new Date(now.getTime() - REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000)
  const reminderConfig = getReminderConfig()

  const overdueTransitionResult = await SimpleInvoice.updateMany(
    {
      status: "pending",
      dueDate: { $lt: now },
      $expr: { $lt: ["$paidAmount", "$total"] },
    },
    {
      $set: {
        status: "overdue",
        updatedAt: now,
      },
    },
  ).exec()

  const reminderCandidates = await SimpleInvoice.find({
    status: "overdue",
    dueDate: { $lt: now },
    $expr: { $lt: ["$paidAmount", "$total"] },
    $or: [{ lastReminderSentAt: null }, { lastReminderSentAt: { $lte: reminderCutoff } }],
  })
    .select(
      "invoiceNumber clientName clientEmail dueDate total paidAmount currency paymentLinkUrl reminderCount lastReminderSentAt",
    )
    .lean()
    .exec()

  let attempted = 0
  let sent = 0
  let failed = 0
  let skipped = 0

  for (const candidate of reminderCandidates as any[]) {
    attempted += 1

    try {
      const emailResult = await sendOverdueReminderEmail({
        invoice: candidate,
        config: reminderConfig,
      })

      if (!emailResult.sent) {
        skipped += 1
        continue
      }

      await SimpleInvoice.updateOne(
        { _id: candidate._id },
        {
          $set: {
            lastReminderSentAt: now,
            updatedAt: now,
          },
          $inc: { reminderCount: 1 },
        },
      ).exec()

      sent += 1
    } catch (error) {
      console.error("Invoice reminder delivery error:", error)
      failed += 1
    }
  }

  return {
    overdueTransitioned: overdueTransitionResult.modifiedCount || 0,
    remindersFound: reminderCandidates.length,
    attempted,
    sent,
    failed,
    skipped,
    deliveryEnabled: reminderConfig.isEnabled,
    cooldownHours: REMINDER_COOLDOWN_HOURS,
  }
}

const handleRunRequest = async (request: NextRequest) => {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { blockedResponse } = await enforceRateLimit(request, {
      key: "internal:invoices:reminders",
      max: 30,
      windowMs: 5 * 60 * 1000,
    })

    if (blockedResponse) {
      return blockedResponse
    }

    const run = await startJobRun({
      jobName: "invoice-reminders",
      trigger: "cron",
      metadata: {
        route: "/api/internal/invoices/reminders",
      },
    })

    try {
      const summary = await runOverdueReminderJob()

      await completeJobRun({
        runId: run._id.toString(),
        status: "success",
        summary,
      })

      return NextResponse.json({
        success: true,
        runId: run._id,
        summary,
      })
    } catch (runnerError) {
      await failJobRun({
        runId: run._id.toString(),
        error: runnerError,
      })

      throw runnerError
    }
  } catch (error) {
    console.error("Invoice reminder runner error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to run invoice reminder job" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  return handleRunRequest(request)
}

export async function GET(request: NextRequest) {
  return handleRunRequest(request)
}
