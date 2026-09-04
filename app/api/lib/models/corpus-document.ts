import mongoose from "mongoose";

const CorpusDocumentSchema = new mongoose.Schema(
  {
    clerkUid: { type: String, required: true, index: true },
    corpusId: { type: String, required: true, index: true },
    documentId: { type: String, required: true },
    filename: { type: String, required: true },
    mimeType: { type: String, default: "application/octet-stream" },
    size: { type: Number, default: 0 },
    r2Key: { type: String, required: true },
    chunkCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "indexing", "ready", "failed"],
      default: "pending",
    },
    error: { type: String, default: "" },
    // Whether compressPdf actually shrank the archived copy, and why not when it
    // did not. Mirrors VaultDocument's field of the same name. Indexing always
    // reads the uncompressed original, so this never affects retrieval.
    compressionStatus: {
      type: String,
      enum: ["compressed", "unchanged"],
      default: "unchanged",
    },
    compressionReason: { type: String, default: "" },
  },
  { timestamps: true }
);

CorpusDocumentSchema.index({ clerkUid: 1, corpusId: 1, createdAt: -1 });

const CorpusDocument =
  mongoose.models["CorpusDocument"] || mongoose.model("CorpusDocument", CorpusDocumentSchema);

export default CorpusDocument;
