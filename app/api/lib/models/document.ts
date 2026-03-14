import mongoose from "mongoose";

const DocumentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    documentType: {
      type: String,
      required: true,
      enum: ["affidavit", "invoice", "legal_notice", "contract", "report", "other"],
      index: true,
    },
    title: {
      type: String,
      default: "",
    },
    filePath: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    mimeType: {
      type: String,
      default: "application/pdf",
    },
  },
  {
    timestamps: true,
  }
);

DocumentSchema.index({ createdAt: -1 });
DocumentSchema.index({ documentType: 1, createdAt: -1 });

const Document =
  mongoose.models["Document"] ||
  mongoose.model("Document", DocumentSchema);

export default Document;
