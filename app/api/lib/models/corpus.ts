import mongoose from "mongoose";

const CorpusSchema = new mongoose.Schema(
  {
    clerkUid: { type: String, required: true, index: true },
    corpusId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    instructions: { type: String, default: "" },
    caseIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Case" }],
    clientIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Client" }],
    accent: { type: String, default: "teal" },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

CorpusSchema.index({ clerkUid: 1, corpusId: 1 }, { unique: true });
CorpusSchema.index({ clerkUid: 1, updatedAt: -1 });

const Corpus = mongoose.models["Corpus"] || mongoose.model("Corpus", CorpusSchema);

export default Corpus;
