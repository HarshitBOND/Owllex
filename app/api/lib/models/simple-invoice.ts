import mongoose from "mongoose"

const InvoiceItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    quantity: { type: Number, required: true },
    rate: { type: Number, required: true },
    amount: { type: Number, required: true },
  },
  { _id: true },
)

const PaymentRecordSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    method: {
      type: String,
      enum: ["cash", "bank_transfer", "credit_card", "check", "paypal", "upi", "other"],
      required: true,
    },
    date: { type: Date, required: true },
    reference: { type: String },
    notes: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
)

const SimpleInvoiceSchema = new mongoose.Schema(
  {
    clerkUid: { type: String, required: true, index: true },
    invoiceNumber: { type: String, required: true, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
    clientName: { type: String, required: true },
    clientEmail: { type: String },
    clientCompany: { type: String },
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: "Case" },
    caseTitle: { type: String },
    status: {
      type: String,
      enum: ["draft", "pending", "paid", "overdue"],
      default: "draft",
      index: true,
    },
    issueDate: { type: Date, required: true },
    dueDate: { type: Date, required: true, index: true },
    items: { type: [InvoiceItemSchema], required: true },
    subtotal: { type: Number, required: true },
    tax: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    currency: { type: String, default: "USD" },
    total: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    payments: { type: [PaymentRecordSchema], default: [] },
    paymentLinkUrl: { type: String, default: null },
    paymentLinkCheckoutSessionId: { type: String, default: null },
    paymentLinkCreatedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    lastReminderSentAt: { type: Date, default: null },
    reminderCount: { type: Number, default: 0 },
    notes: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
  },
)

SimpleInvoiceSchema.index({ clerkUid: 1, status: 1, dueDate: 1 })

const SimpleInvoice =
  mongoose.models["SimpleInvoice"] || mongoose.model("SimpleInvoice", SimpleInvoiceSchema)

export default SimpleInvoice
