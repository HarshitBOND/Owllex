import mongoose from "mongoose";

/**
 * What a corpus has learned from the forms drafted against it.
 *
 * Until now every answer an advocate typed was thrown away when the draft
 * closed, so the same client address was retyped on every form. Each answer is
 * recorded here against its field key, which is what lets the next form open
 * mostly filled in -- by exact lookup, with no model call and no embedding cost.
 *
 * Only values the advocate typed or confirmed are stored. A value that merely
 * came back OUT of the corpus is never written back, or retrieval noise would
 * compound into recorded fact.
 *
 * Changing an answer supersedes the old row rather than overwriting it, so the
 * history of what a document said, and when, stays readable.
 */

export interface CorpusFactDoc {
  _id: mongoose.Types.ObjectId;
  clerkUid: string;
  corpusId: string;
  key: string;
  label: string;
  value: string;
  valueType: "text" | "date" | "number" | "select";
  sourceType: "wizard" | "user-edit" | "case" | "ai";
  sourceDraftId: mongoose.Types.ObjectId | null;
  sourceTemplateId: mongoose.Types.ObjectId | null;
  sourceTemplateVersion: number;
  confidence: number;
  supersededAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const CorpusFactSchema = new mongoose.Schema(
  {
    clerkUid: { type: String, required: true, index: true },
    corpusId: { type: String, required: true, index: true },
    // The field key the value was captured against -- "court_name", or
    // "parties.0.tehsil" for a cell inside a repeating table.
    key: { type: String, required: true },
    label: { type: String, default: "" },
    value: { type: String, required: true, maxlength: 4000 },
    valueType: { type: String, enum: ["text", "date", "number", "select"], default: "text" },
    sourceType: {
      type: String,
      enum: ["wizard", "user-edit", "case", "ai"],
      default: "wizard",
    },
    sourceDraftId: { type: mongoose.Schema.Types.ObjectId, ref: "DraftDocument", default: null },
    sourceTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: "DocumentTemplate", default: null },
    sourceTemplateVersion: { type: Number, default: 0 },
    confidence: { type: Number, default: 1, min: 0, max: 1 },
    // Null means this is the value in force. A superseded row is kept for the
    // audit trail and is never used to fill anything.
    supersededAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The lookup that fills the next form: current facts for one user's corpus.
CorpusFactSchema.index({ clerkUid: 1, corpusId: 1, key: 1, supersededAt: 1 });
CorpusFactSchema.index({ clerkUid: 1, corpusId: 1, updatedAt: -1 });

const CorpusFact = (mongoose.models["CorpusFact"] ||
  mongoose.model("CorpusFact", CorpusFactSchema)) as mongoose.Model<CorpusFactDoc>;

export default CorpusFact;
