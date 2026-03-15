import mongoose from "mongoose";

const ComplaintSchema = new mongoose.Schema(
  {
    clerkUid: {
      type: String,
      default: null,
      index: true,
    },
    source: {
      type: String,
      enum: ["contact-us", "other"],
      default: "contact-us",
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 200,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
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

ComplaintSchema.index({ status: 1, createdAt: -1 });

const Complaint =
  mongoose.models["Complaint"] || mongoose.model("Complaint", ComplaintSchema);

export default Complaint;
