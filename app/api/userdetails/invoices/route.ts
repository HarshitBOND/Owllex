import { NextRequest, NextResponse } from "next/server"
import connectMongoWithRetry from "../../lib/db/connectMongo"
import { auth } from "@clerk/nextjs/server"
import { ensureUser } from "../../lib/ensureUser"
import mongoose from "mongoose"

// Simple invoice schema for lawyer self-service invoicing
const InvoiceItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  quantity: { type: Number, required: true },
  rate: { type: Number, required: true },
  amount: { type: Number, required: true },
})

const SimpleInvoiceSchema = new mongoose.Schema({
  clerkUid: { type: String, required: true, index: true },
  invoiceNumber: { type: String, required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
  clientName: { type: String, required: true },
  clientEmail: { type: String },
  clientCompany: { type: String },
  caseId: { type: mongoose.Schema.Types.ObjectId, ref: "Case" },
  caseTitle: { type: String },
  status: { type: String, enum: ["draft", "pending", "paid", "overdue"], default: "draft" },
  issueDate: { type: Date, required: true },
  dueDate: { type: Date, required: true },
  items: { type: [InvoiceItemSchema], required: true },
  subtotal: { type: Number, required: true },
  tax: { type: Number, default: 0 },
  taxRate: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  notes: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

const SimpleInvoice = mongoose.models["SimpleInvoice"] || mongoose.model("SimpleInvoice", SimpleInvoiceSchema)

// GET - Fetch all invoices for current user, or single by id
export async function GET(req: NextRequest) {
  try {
    await connectMongoWithRetry()
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await ensureUser(userId)

    const invoiceId = req.nextUrl.searchParams.get("id")
    if (invoiceId) {
      const invoice = await SimpleInvoice.findOne({ _id: invoiceId, clerkUid: userId }).lean()
      return NextResponse.json({ invoice })
    }

    const invoices = await SimpleInvoice.find({ clerkUid: userId })
      .sort({ createdAt: -1 })
      .lean()
    return NextResponse.json({ invoices })
  } catch (error) {
    console.error("Invoice GET error:", error)
    return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 })
  }
}

// POST - Create new invoice
export async function POST(req: NextRequest) {
  try {
    await connectMongoWithRetry()
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await ensureUser(userId)

    const data = await req.json()

    // Generate invoice number
    const count = await SimpleInvoice.countDocuments({ clerkUid: userId })
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`

    const invoice = new SimpleInvoice({
      ...data,
      clerkUid: userId,
      invoiceNumber,
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

// PUT - Update invoice
export async function PUT(req: NextRequest) {
  try {
    await connectMongoWithRetry()
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const invoiceId = req.nextUrl.searchParams.get("id")
    if (!invoiceId) return NextResponse.json({ error: "Invoice ID required" }, { status: 400 })

    const data = await req.json()
    const invoice = await SimpleInvoice.findOneAndUpdate(
      { _id: invoiceId, clerkUid: userId },
      { ...data, updatedAt: new Date() },
      { new: true }
    )

    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    return NextResponse.json({ invoice })
  } catch (error) {
    console.error("Invoice PUT error:", error)
    return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 })
  }
}

// DELETE - Delete invoice
export async function DELETE(req: NextRequest) {
  try {
    await connectMongoWithRetry()
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const invoiceId = req.nextUrl.searchParams.get("id")
    if (!invoiceId) return NextResponse.json({ error: "Invoice ID required" }, { status: 400 })

    const invoice = await SimpleInvoice.findOneAndDelete({ _id: invoiceId, clerkUid: userId })
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Invoice DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete invoice" }, { status: 500 })
  }
}
