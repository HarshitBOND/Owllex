import mongoose from "mongoose"

const VaultDocumentSchema = new mongoose.Schema(
  {
    clerkUid: { type: String, required: true, index: true },
    filename: { type: String, required: true },
    mimeType: { type: String, default: "application/octet-stream" },
    size: { type: Number, default: 0 },
    r2Key: { type: String, required: true },
    // Hash of the bytes stored in R2 (post-compression) -- this is what the
    // verify endpoint re-checks. originalSha256/originalSize record the file as
    // the user uploaded it, before compression changed it.
    sha256: { type: String, required: true },
    originalSha256: { type: String, default: "" },
    originalSize: { type: Number, default: 0 },
    verifyStatus: {
      type: String,
      enum: ["unverified", "present", "verified", "missing", "corrupted"],
      default: "unverified",
    },
    lastVerifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

VaultDocumentSchema.index({ clerkUid: 1, createdAt: -1 })

const VaultDocument =
  mongoose.models["VaultDocument"] || mongoose.model("VaultDocument", VaultDocumentSchema)

export default VaultDocument
