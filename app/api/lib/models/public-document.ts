import mongoose from "mongoose"

const PublicDocumentSchema = new mongoose.Schema(
  {
    documentId: { type: String, required: true, unique: true },
    title: { type: String, default: "" },
    documentType: { type: String, default: "" },
    date: { type: String, default: "" },
    sourceUrl: { type: String, default: "" },
    storageRef: { type: String, required: true },
    ingestedByAdminId: { type: String, required: true },
  },
  { timestamps: true },
)

const PublicDocument =
  mongoose.models["PublicDocument"] || mongoose.model("PublicDocument", PublicDocumentSchema)

export default PublicDocument
