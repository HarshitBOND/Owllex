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
    description: {
      type: String,
      default: "",
    },
    currency: {
      type: String,
      default: "INR",
    },
  },
  {
    timestamps: true,
  }
);

TransactionSchema.index({ createdAt: -1 });
TransactionSchema.index({ status: 1, createdAt: -1 });

const Transaction =
  mongoose.models["Transaction"] ||
  mongoose.model("Transaction", TransactionSchema);

export default Transaction;
