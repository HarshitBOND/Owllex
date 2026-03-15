import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import sgMail from "@sendgrid/mail"
import PDFDocument from "pdfkit"
import connectMongoWithRetry from "../../lib/db/connectMongo"
import { ensureUser } from "../../lib/ensureUser"
import SimpleInvoice from "../../lib/models/simple-invoice"
import User from "../../lib/models/user"
import Transaction from "../../lib/models/transaction"
import { getStripeCheckoutBaseUrl, getStripeClient } from "../../lib/services/stripe"

const normalizeCurrency = (currency?: string | null) => (currency || "USD").toUpperCase()

const toDisplayCurrency = (amount: number, currency = "USD") => {
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
  const stripe = getStripeClient()
  if (!stripe) {
    return {
      created: false,
      error: "Stripe is not configured. Add STRIPE_SECRET_KEY.",
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

  const currency = normalizeCurrency(invoice.currency).toLowerCase()

  const transaction = await Transaction.create({
    userId: user._id,
    amount: outstanding,
    status: "pending",
    paymentGateway: "stripe",
    description: `Invoice payment: ${invoice.invoiceNumber}`,
    currency: currency.toUpperCase(),
    metadata: {
      type: "invoice-payment",
      invoiceId: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
    },
  })

  const appBaseUrl = getStripeCheckoutBaseUrl()
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: Math.round(outstanding * 100),
          product_data: {
            name: `Invoice ${invoice.invoiceNumber}`,
            description: invoice.caseTitle || `Payment for invoice ${invoice.invoiceNumber}`,
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${appBaseUrl}/invoices?payment=success&invoice=${invoice._id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appBaseUrl}/invoices?payment=cancelled&invoice=${invoice._id}`,
    client_reference_id: clerkUid,
    customer_email: invoice.clientEmail || (user as any).email || undefined,
    metadata: {
      paymentType: "invoice",
      invoiceId: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      clerkUid,
      transactionId: transaction._id.toString(),
    },
  })

  transaction.checkoutSessionId = session.id
  transaction.metadata = {
    ...(transaction.metadata || {}),
    stripeCheckoutSessionId: session.id,
  }
  await transaction.save()

  invoice.paymentLinkUrl = session.url
  invoice.paymentLinkCheckoutSessionId = session.id
  invoice.paymentLinkCreatedAt = new Date()
  if (invoice.status === "draft") {
    invoice.status = "pending"
  }
  invoice.updatedAt = new Date()
  await invoice.save()

  return {
    created: true,
    error: null,
    paymentLinkUrl: session.url || null,
    checkoutSessionId: session.id,
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
    await connectMongoWithRetry()
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await ensureUser(userId)

    const invoiceId = req.nextUrl.searchParams.get("id")
    const format = req.nextUrl.searchParams.get("format")

    if (invoiceId) {
      const invoiceDoc = await SimpleInvoice.findOne({ _id: invoiceId, clerkUid: userId }).lean().exec()
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

    const invoices = await SimpleInvoice.find({ clerkUid: userId })
      .sort({ createdAt: -1 })
      .lean()
      .exec()

    return NextResponse.json({ invoices })
  } catch (error) {
    console.error("Invoice GET error:", error)
    return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectMongoWithRetry()
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await ensureUser(userId)

    const data = await req.json()

    const count = await SimpleInvoice.countDocuments({ clerkUid: userId })
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`

    const invoice = new SimpleInvoice({
      ...data,
      clerkUid: userId,
      invoiceNumber,
      currency: normalizeCurrency(data?.currency),
      status: data?.status || "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await invoice.save()

    return NextResponse.json({ invoice })
  } catch (error) {
    console.error("Invoice POST error:", error)
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await connectMongoWithRetry()
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const invoiceId = req.nextUrl.searchParams.get("id")
    if (!invoiceId) {
      return NextResponse.json({ error: "Invoice ID required" }, { status: 400 })
    }

    const data = await req.json()
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
      paymentLink = await createInvoicePaymentCheckout({ invoice, clerkUid: userId })
    }

    let emailResult: { sent: boolean; reason: string | null } | null = null
    if (sendEmail) {
      if (invoice.status === "draft") {
        invoice.status = "pending"
      }

      invoice.sentAt = new Date()
      invoice.updatedAt = new Date()
      await invoice.save()

      emailResult = await sendInvoiceEmail({
        invoice,
        paymentLinkUrl: paymentLink?.paymentLinkUrl || invoice.paymentLinkUrl || null,
      })
    }

    return NextResponse.json({
      invoice,
      email: emailResult,
      paymentLink,
    })
  } catch (error) {
    console.error("Invoice PUT error:", error)
    return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await connectMongoWithRetry()
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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
    await connectMongoWithRetry()
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const invoiceId = req.nextUrl.searchParams.get("id")
    if (!invoiceId) {
      return NextResponse.json({ error: "Invoice ID required" }, { status: 400 })
    }

    const { amount, method, date, reference, notes } = await req.json()

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Valid payment amount required" }, { status: 400 })
    }

    if (!method) {
      return NextResponse.json({ error: "Payment method required" }, { status: 400 })
    }

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
