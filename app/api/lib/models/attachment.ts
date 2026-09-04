import mongoose from "mongoose";

const AttachmentSchema = new mongoose.Schema(
  {
    clerkUid: { type: String, required: true, index: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    r2Key: { type: String, required: true },
    // Whether compressPdf actually shrank this upload, and why not when it did
    // not. Mirrors VaultDocument's field of the same name.
    compressionStatus: {
      type: String,
      enum: ["compressed", "unchanged"],
      default: "unchanged",
    },
    compressionReason: { type: String, default: "" },
  },
  {
    timestamps: true,
  }
);

const Attachment =
  mongoose.models["Attachment"] ||
  mongoose.model("Attachment", AttachmentSchema);

export default Attachment;
