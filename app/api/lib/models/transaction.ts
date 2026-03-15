import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    paymentGateway: {
      type: String,
      enum: ["stripe", "razorpay", "paypal", "manual"],
      required: true,
    },
    gatewayTransactionId: {
      type: String,
      default: null,
    },
    checkoutSessionId: {
      type: String,
      default: null,
      index: true,
    },
    subscriptionId: {
      type: String,
      default: null,
      index: true,
    },
    customerId: {
      type: String,
      default: null,
    },
    paymentIntentId: {
      type: String,
      default: null,
    },
    receiptUrl: {
      type: String,
      default: null,
    },
    invoiceUrl: {
      type: String,
      default: null,
    },
    failureReason: {
      type: String,
      default: "",
    },
    supportIssueStatus: {
      type: String,
      enum: ["open", "in_progress", "resolved"],
      default: "open",
      index: true,
    },
    supportIssueNotes: {
      type: String,
      default: "",
    },
    supportIssueHandledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    supportIssueHandledAt: {
      type: Date,
      default: null,
    },
    description: {
      type: String,
      default: "",
    },
    currency: {
      type: String,
      default: "INR",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

TransactionSchema.index({ createdAt: -1 });
TransactionSchema.index({ status: 1, createdAt: -1 });
TransactionSchema.index({ supportIssueStatus: 1, createdAt: -1 });

const Transaction =
  mongoose.models["Transaction"] ||
  mongoose.model("Transaction", TransactionSchema);

export default Transaction;
