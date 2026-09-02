import mongoose from "mongoose"

const DocumentAccessTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true },
    documentId: { type: String, required: true },
    clerkUid: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

// Mongo purges the row itself once expiresAt passes -- expiry needs no cron.
DocumentAccessTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const DocumentAccessToken =
  mongoose.models["DocumentAccessToken"] || mongoose.model("DocumentAccessToken", DocumentAccessTokenSchema)

export default DocumentAccessToken
