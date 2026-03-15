import mongoose from "mongoose";

const SupportMessageSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["contact", "fraud-report"],
      default: "contact",
      index: true,
    },
    source: {
      type: String,
      enum: ["contact-us", "report-fraud", "other"],
      default: "contact-us",
    },
    clerkUid: {
      type: String,
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["new", "in_progress", "resolved"],
      default: "new",
      index: true,
    },
    handledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    handledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

SupportMessageSchema.index({ status: 1, createdAt: -1 });

const SupportMessage =
  mongoose.models["SupportMessage"] ||
  mongoose.model("SupportMessage", SupportMessageSchema);

export default SupportMessage;
