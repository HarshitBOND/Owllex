import { NextRequest, NextResponse } from "next/server"
import sgMail from "@sendgrid/mail"
import PDFDocument from "pdfkit"
import connectMongoWithRetry from "../../lib/db/connectMongo"
import { ensureUser } from "../../lib/ensureUser"
import SimpleInvoice from "../../lib/models/simple-invoice"
import User from "../../lib/models/user"
import Transaction from "../../lib/models/transaction"
import { getRazorpayCheckoutBaseUrl, getRazorpayClient } from "../../lib/services/razorpay"
import { addInvoicePaymentSchema, createInvoiceSchema, updateInvoiceSchema } from "@/app/api/lib/validators/userdetails"
import { requireUserContext } from "@/app/api/lib/routeGuards"
import { canAccessFirm, type TeamPermission } from "@/app/api/lib/services/rbac"

const normalizeCurrency = (currency?: string | null) => (currency || "INR").toUpperCase()

const toDisplayCurrency = (amount: number, currency = "INR") => {
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

const generateInvoicePdfBuffer = (invoice: any) =>
  new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 })
    const chunks: Buffer[] = []

    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    const currency = normalizeCurrency(invoice.currency)
    const issueDate = new Date(invoice.issueDate)
    const dueDate = new Date(invoice.dueDate)

    doc.fontSize(20).text("LexVert Invoice", { align: "left" })
    doc.moveDown(0.4)
    doc.fontSize(10).fillColor("#555").text(`Invoice Number: ${invoice.invoiceNumber}`)
    doc.text(`Issue Date: ${issueDate.toLocaleDateString("en-IN")}`)
    doc.text(`Due Date: ${dueDate.toLocaleDateString("en-IN")}`)

    doc.moveDown(1)
    doc.fillColor("#000").fontSize(13).text("Bill To")
    doc.fontSize(10).fillColor("#333").text(invoice.clientName || "Client")
    if (invoice.clientCompany) {
      doc.text(invoice.clientCompany)
    }
    if (invoice.clientEmail) {
      doc.text(invoice.clientEmail)
    }

    doc.moveDown(1)
    doc.fillColor("#000").fontSize(13).text("Items")

    const startY = doc.y + 8
    const itemRows = Array.isArray(invoice.items) ? invoice.items : []

    doc.fontSize(10).text("Description", 48, startY)
    doc.text("Qty", 280, startY, { width: 60, align: "right" })
    doc.text("Rate", 350, startY, { width: 80, align: "right" })
    doc.text("Amount", 440, startY, { width: 110, align: "right" })

    let rowY = startY + 22

    for (const item of itemRows) {
      doc.fontSize(10).fillColor("#111").text(item.description || "Item", 48, rowY, {
        width: 220,
      })
      doc.text(String(item.quantity || 0), 280, rowY, { width: 60, align: "right" })
      doc.text(toDisplayCurrency(Number(item.rate || 0), currency), 350, rowY, {
        width: 80,
        align: "right",
      })
      doc.text(toDisplayCurrency(Number(item.amount || 0), currency), 440, rowY, {
        width: 110,
        align: "right",
      })

      rowY += 20
    }

    const totalsY = rowY + 18
    doc.fontSize(10).fillColor("#333").text("Subtotal", 350, totalsY, { width: 80, align: "right" })
    doc.text(toDisplayCurrency(Number(invoice.subtotal || 0), currency), 440, totalsY, {
      width: 110,
      align: "right",
    })

    if (Number(invoice.discount || 0) > 0) {
      doc.text("Discount", 350, totalsY + 18, { width: 80, align: "right" })
      doc.text(`-${toDisplayCurrency(Number(invoice.discount || 0), currency)}`, 440, totalsY + 18, {
        width: 110,
        align: "right",
      })
    }

    doc.text(`Tax (${Number(invoice.taxRate || 0)}%)`, 350, totalsY + 36, { width: 80, align: "right" })
    doc.text(toDisplayCurrency(Number(invoice.tax || 0), currency), 440, totalsY + 36, {
      width: 110,
      align: "right",
    })

    const totalY = totalsY + 58
    doc.fontSize(12).fillColor("#000").text("Total", 350, totalY, { width: 80, align: "right" })
    doc.text(toDisplayCurrency(Number(invoice.total || 0), currency), 440, totalY, {
      width: 110,
      align: "right",
    })

    const outstanding = getOutstandingAmount(invoice)
    doc.fontSize(10)
      .fillColor("#333")
      .text("Paid", 350, totalY + 22, { width: 80, align: "right" })
      .text(toDisplayCurrency(Number(invoice.paidAmount || 0), currency), 440, totalY + 22, {
        width: 110,
        align: "right",
      })
      .text("Outstanding", 350, totalY + 40, { width: 80, align: "right" })
      .text(toDisplayCurrency(outstanding, currency), 440, totalY + 40, { width: 110, align: "right" })

    if (invoice.notes) {
      doc.moveDown(2)
      doc.fontSize(12).fillColor("#000").text("Notes")
      doc.fontSize(10).fillColor("#333").text(invoice.notes)
    }

    doc.end()
  })

const sendInvoiceEmail = async ({
  invoice,
  paymentLinkUrl,
}: {
  invoice: any
  paymentLinkUrl?: string | null
}) => {
  const toEmail = typeof invoice.clientEmail === "string" ? invoice.clientEmail.trim() : ""
  if (!toEmail) {
    return { sent: false, reason: "missing-client-email" }
  }

  const apiKey = process.env.SENDGRID_API_KEY?.trim()
  const fromEmail = process.env.NOTIFICATION_FROM_EMAIL?.trim()
  const fromName = process.env.NOTIFICATION_FROM_NAME?.trim() || "LexVert"

  if (!apiKey || !fromEmail) {
    return { sent: false, reason: "sendgrid-not-configured" }
  }

  const currency = normalizeCurrency(invoice.currency)
  const outstanding = getOutstandingAmount(invoice)

  sgMail.setApiKey(apiKey)

  const lines = [
    `Hello ${invoice.clientName || "Client"},`,
    "",
    `Invoice ${invoice.invoiceNumber} has been issued from LexVert.`,
    `Issue date: ${new Date(invoice.issueDate).toLocaleDateString("en-IN")}`,
    `Due date: ${new Date(invoice.dueDate).toLocaleDateString("en-IN")}`,
    `Total: ${toDisplayCurrency(Number(invoice.total || 0), currency)}`,
    `Outstanding: ${toDisplayCurrency(outstanding, currency)}`,
  ]

  if (paymentLinkUrl) {
    lines.push("", `Pay online: ${paymentLinkUrl}`)
  }

  lines.push("", "Regards,", "LexVert")

  await sgMail.send({
    to: toEmail,
    from: { email: fromEmail, name: fromName },
    subject: `Invoice ${invoice.invoiceNumber} from LexVert`,
    text: lines.join("\n"),
  })

  return { sent: true, reason: null }
}

const createInvoicePaymentCheckout = async ({
  invoice,
  clerkUid,
}: {
  invoice: any
  clerkUid: string
}) => {
  const razorpay = getRazorpayClient()
  if (!razorpay) {
    return {
      created: false,
      error: "Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
      paymentLinkUrl: null as string | null,
      checkoutSessionId: null as string | null,
    }
  }

  const outstanding = getOutstandingAmount(invoice)
  if (outstanding <= 0) {
    return {
      created: false,
      error: "Invoice is already fully paid",
      paymentLinkUrl: null,
      checkoutSessionId: null,
    }
  }

  const userDoc = await User.findOne({ clerkUid }).select("_id email").lean().exec()
  const user: any = userDoc
  if (!user?._id) {
    return {
      created: false,
      error: "User not found",
      paymentLinkUrl: null,
      checkoutSessionId: null,
    }
  }

  const currency = normalizeCurrency(invoice.currency)
  if (currency !== "INR") {
    return {
      created: false,
      error: "UPI-friendly Razorpay links currently require INR invoice currency.",
      paymentLinkUrl: null,
      checkoutSessionId: null,
    }
  }

  const transaction = await Transaction.create({
    userId: user._id,
    amount: outstanding,
    status: "pending",
    paymentGateway: "razorpay",
    description: `Invoice payment: ${invoice.invoiceNumber}`,
    currency,
    metadata: {
      type: "invoice-payment",
      invoiceId: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
    },
  })

  const appBaseUrl = getRazorpayCheckoutBaseUrl()
  const paymentLinkPayload = {
    amount: Math.round(outstanding * 100),
    currency,
    accept_partial: false,
    description: invoice.caseTitle || `Payment for invoice ${invoice.invoiceNumber}`,
    callback_url: `${appBaseUrl}/invoices?payment=success&invoice=${invoice._id}`,
    callback_method: "get",
    notify: {
      email: Boolean(invoice.clientEmail),
      sms: false,
    },
    customer:
      invoice.clientEmail || (user as any).email
        ? {
            name: invoice.clientName || undefined,
            email: invoice.clientEmail || (user as any).email || undefined,
          }
        : undefined,
    notes: {
      paymentType: "invoice",
      invoiceId: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      clerkUid,
      transactionId: transaction._id.toString(),
    },
  }

  const paymentLink = await razorpay.paymentLink.create(
    paymentLinkPayload as unknown as Parameters<typeof razorpay.paymentLink.create>[0],
  )

  transaction.checkoutSessionId = paymentLink.id
  transaction.metadata = {
    ...(transaction.metadata || {}),
    razorpayPaymentLinkId: paymentLink.id,
    razorpayPaymentLinkUrl: paymentLink.short_url || null,
  }
  await transaction.save()

  invoice.paymentLinkUrl = paymentLink.short_url || null
  invoice.paymentLinkCheckoutSessionId = paymentLink.id
  invoice.paymentLinkCreatedAt = new Date()
  if (invoice.status === "draft") {
    invoice.status = "pending"
  }
  invoice.updatedAt = new Date()
  await invoice.save()

  return {
    created: true,
    error: null,
    paymentLinkUrl: paymentLink.short_url || null,
    checkoutSessionId: paymentLink.id,
  }
}

const refreshOverdueInvoices = async (clerkUid: string) => {
  const now = new Date()
  await SimpleInvoice.updateMany(
    {
      clerkUid,
      status: { $in: ["pending"] },
      dueDate: { $lt: now },
    },
    {
      $set: {
        status: "overdue",
        updatedAt: now,
      },
    },
  ).exec()
}

export async function GET(req: NextRequest) {
  try {
    const userContext = await requireUserContext(req)
    if (userContext instanceof NextResponse) {
      return userContext
    }

    await connectMongoWithRetry()
    const userId = userContext.clerkUid

    await ensureUser(userId)

    const actorUser = await User.findOne({ clerkUid: userId }).select("primaryFirmId").lean().exec()
    const actorFirmId = (actorUser as any)?.primaryFirmId ? (actorUser as any).primaryFirmId.toString() : null
    const scope = req.nextUrl.searchParams.get("scope")

    const invoiceId = req.nextUrl.searchParams.get("id")
    const format = req.nextUrl.searchParams.get("format")

    if (invoiceId) {
      let invoiceDoc = await SimpleInvoice.findOne({ _id: invoiceId, clerkUid: userId }).lean().exec()

      if (!invoiceDoc && actorFirmId) {
        const firmAccess = await canAccessFirm(userId, actorFirmId, "invoice.read" as TeamPermission)
        if (firmAccess.allowed) {
          invoiceDoc = await SimpleInvoice.findOne({ _id: invoiceId, firmId: actorFirmId }).lean().exec()
        }
      }

      const invoice: any = invoiceDoc
      if (!invoice) {
        return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
      }

      if (format === "pdf") {
        const pdf = await generateInvoicePdfBuffer(invoice)
        return new NextResponse(pdf as any, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${invoice.invoiceNumber || "invoice"}.pdf"`,
            "Cache-Control": "no-store",
          },
        })
      }

      return NextResponse.json({ invoice })
    }

    await refreshOverdueInvoices(userId)

    let invoices: any[] = []

    if (scope === "firm" && actorFirmId) {
      const firmAccess = await canAccessFirm(userId, actorFirmId, "invoice.read" as TeamPermission)
      if (!firmAccess.allowed) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }

      invoices = await SimpleInvoice.find({ firmId: actorFirmId })
        .sort({ createdAt: -1 })
        .lean()
        .exec()
    } else {
      invoices = await SimpleInvoice.find({ clerkUid: userId })
        .sort({ createdAt: -1 })
        .lean()
        .exec()
    }

    return NextResponse.json({ invoices })
  } catch (error) {
    console.error("Invoice GET error:", error)
    return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userContext = await requireUserContext(req)
    if (userContext instanceof NextResponse) {
      return userContext
    }

    await connectMongoWithRetry()
    const userId = userContext.clerkUid

    await ensureUser(userId)

    let rawBody: Record<string, unknown> | null = null
    try {
      rawBody = (await req.json()) as Record<string, unknown> | null
    } catch (parseError) {
      console.error("[INVOICE_POST] JSON parse error:", parseError instanceof Error ? parseError.message : String(parseError))
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    if (!rawBody) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = createInvoiceSchema.safeParse(rawBody)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || "Invalid invoice payload"
      return NextResponse.json({ error: issue }, { status: 400 })
    }

    const data = parsed.data
    const ownerUser = await User.findOne({ clerkUid: userId }).select("primaryFirmId").lean().exec()

    const count = await SimpleInvoice.countDocuments({ clerkUid: userId })
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`

    const invoice = new SimpleInvoice({
      ...data,
      clerkUid: userId,
      firmId: (ownerUser as any)?.primaryFirmId || null,
      invoiceNumber,
      currency: normalizeCurrency(data?.currency),
      status: data?.status || "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const savedInvoice = await invoice.save()
    console.log("[INVOICE_POST] Created invoice:", {
      _id: savedInvoice._id,
      invoiceNumber: savedInvoice.invoiceNumber,
      status: savedInvoice.status,
      clientName: data.clientName,
    })

    return NextResponse.json({ 
      success: true,
      invoice: {
        _id: savedInvoice._id,
        invoiceNumber: savedInvoice.invoiceNumber,
        status: savedInvoice.status,
        clientName: data.clientName,
        clientEmail: data.clientEmail,
        total: data.total,
      }
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error("[INVOICE_POST] Error:", errMsg)
    return NextResponse.json({ error: "Failed to create invoice", details: errMsg }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userContext = await requireUserContext(req)
    if (userContext instanceof NextResponse) {
      return userContext
    }

    await connectMongoWithRetry()
    const userId = userContext.clerkUid

    const invoiceId = req.nextUrl.searchParams.get("id")
    if (!invoiceId) {
      return NextResponse.json({ error: "Invoice ID required" }, { status: 400 })
    }

    let rawBody: Record<string, unknown> | null = null
    try {
      rawBody = (await req.json()) as Record<string, unknown> | null
    } catch (parseError) {
      console.error("[INVOICE_PUT] JSON parse error:", parseError instanceof Error ? parseError.message : String(parseError))
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    if (!rawBody) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = updateInvoiceSchema.safeParse(rawBody)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || "Invalid invoice payload"
      return NextResponse.json({ error: issue }, { status: 400 })
    }

    const data = parsed.data
    const sendEmail = Boolean(data?.sendEmail)
    const createPaymentLink = Boolean(data?.createPaymentLink)

    const updatePayload = { ...data } as Record<string, unknown>
    delete updatePayload.sendEmail
    delete updatePayload.createPaymentLink

    if (typeof updatePayload.currency === "string") {
      updatePayload.currency = normalizeCurrency(updatePayload.currency)
    }

    const invoice = await SimpleInvoice.findOneAndUpdate(
      { _id: invoiceId, clerkUid: userId },
      { ...updatePayload, updatedAt: new Date() },
      { new: true },
    )

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    let paymentLink: {
      created: boolean
      error: string | null
      paymentLinkUrl: string | null
      checkoutSessionId: string | null
    } | null = null

    if (createPaymentLink) {
      try {
        paymentLink = await createInvoicePaymentCheckout({ invoice, clerkUid: userId })
      } catch (paymentError) {
        console.error("[INVOICE_PUT] Payment link creation error:", paymentError instanceof Error ? paymentError.message : String(paymentError))
        // Continue without payment link on error
        paymentLink = {
          created: false,
          error: paymentError instanceof Error ? paymentError.message : "Failed to create payment link",
          paymentLinkUrl: null,
          checkoutSessionId: null,
        }
      }
    }

    let emailResult: { sent: boolean; reason: string | null } | null = null
    if (sendEmail) {
      if (invoice.status === "draft") {
        invoice.status = "pending"
      }

      invoice.sentAt = new Date()
      invoice.updatedAt = new Date()
      await invoice.save()

      try {
        emailResult = await sendInvoiceEmail({
          invoice,
          paymentLinkUrl: paymentLink?.paymentLinkUrl || invoice.paymentLinkUrl || null,
        })
      } catch (emailError) {
        console.error("[INVOICE_PUT] Email sending error:", emailError instanceof Error ? emailError.message : String(emailError))
        emailResult = { sent: false, reason: "email-send-failed" }
      }
    }

    return NextResponse.json({
      invoice,
      email: emailResult,
      paymentLink,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error("[INVOICE_PUT] Unhandled error:", { message: errorMessage, stack: errorStack })
    return NextResponse.json(
      { error: "Failed to update invoice", details: errorMessage },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userContext = await requireUserContext(req)
    if (userContext instanceof NextResponse) {
      return userContext
    }

    await connectMongoWithRetry()
    const userId = userContext.clerkUid

    const invoiceId = req.nextUrl.searchParams.get("id")
    if (!invoiceId) {
      return NextResponse.json({ error: "Invoice ID required" }, { status: 400 })
    }

    const invoice = await SimpleInvoice.findOneAndDelete({ _id: invoiceId, clerkUid: userId })
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Invoice DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete invoice" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userContext = await requireUserContext(req)
    if (userContext instanceof NextResponse) {
      return userContext
    }

    await connectMongoWithRetry()
    const userId = userContext.clerkUid

    const invoiceId = req.nextUrl.searchParams.get("id")
    if (!invoiceId) {
      return NextResponse.json({ error: "Invoice ID required" }, { status: 400 })
    }

    const rawBody = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!rawBody) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsedPayment = addInvoicePaymentSchema.safeParse(rawBody)
    if (!parsedPayment.success) {
      const issue = parsedPayment.error.issues[0]?.message || "Invalid payment payload"
      return NextResponse.json({ error: issue }, { status: 400 })
    }

    const { amount, method, date, reference, notes } = parsedPayment.data

    const invoice = await SimpleInvoice.findOne({ _id: invoiceId, clerkUid: userId })
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    invoice.payments = invoice.payments || []
    invoice.payments.push({
      amount,
      method,
      date: date ? new Date(date) : new Date(),
      reference: reference || undefined,
      notes: notes || undefined,
      createdAt: new Date(),
    })

    const newPaidAmount = Math.min(Number(invoice.paidAmount || 0) + Number(amount), Number(invoice.total || 0))
    invoice.paidAmount = newPaidAmount

    if (newPaidAmount >= Number(invoice.total || 0)) {
      invoice.status = "paid"
    } else if (invoice.status === "draft") {
      invoice.status = "pending"
    }

    invoice.updatedAt = new Date()
    await invoice.save()

    return NextResponse.json({ invoice })
  } catch (error) {
    console.error("Invoice PATCH error:", error)
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 })
  }
}
