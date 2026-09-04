import mongoose from "mongoose";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@/lib/document-categories";

/**
 * fieldValues is the document's real content; contentHtml is what that renders
 * to. Keeping both means a draft can be re-rendered after a wording change,
 * re-asked in the wizard, or migrated to a newer template version, none of
 * which is possible once the answers have been flattened into markup.
 *
 * fieldsVersion pins the template snapshot this draft was started on. Every
 * render, autofill and export resolves against that version and never against
 * the template's latest, so republishing a form cannot alter a document
 * somebody is part way through filing.
 */

export interface DraftDocumentDoc {
  _id: mongoose.Types.ObjectId;
  clerkUid: string;
  title: string;
  contentHtml: string;
  status: "draft" | "final";
  templateId: mongoose.Types.ObjectId | string | null;
  templateTitle: string;
  fieldsVersion: number;
  fieldValues: Record<string, unknown>;
  fieldProvenance: Record<string, { source: string; documentId?: string; quote?: string }>;
  caseId: mongoose.Types.ObjectId | string | null;
  corpusId: string | null;
  rememberInCorpus: boolean;
  category: DocumentCategory | null;
  seedPrompt: string;
  chatMessages: unknown[];
  typography: { fontFamily: string; fontSizePt: number };
  wordCount: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const DraftDocumentSchema = new mongoose.Schema(
  {
    clerkUid: { type: String, required: true, index: true },
    title: { type: String, required: true, default: "Untitled document", trim: true, maxlength: 200 },
    contentHtml: { type: String, default: "", maxlength: 400000 },
    status: { type: String, enum: ["draft", "final"], default: "draft" },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "DocumentTemplate", default: null },
    templateTitle: { type: String, default: "" },
    fieldsVersion: { type: Number, default: 0, min: 0 },
    fieldValues: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    // Per field key: where the value came from -- "case", "corpusFact",
    // "corpusDoc", "user" or "ai" -- plus the source document and the verbatim
    // quote behind it. Drives the "from corpus" badges, and decides what may be
    // written back: only what the advocate typed or confirmed, never a value
    // that merely came back out of the corpus.
    fieldProvenance: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: "Case", default: null },
    corpusId: { type: String, default: null },
    rememberInCorpus: { type: Boolean, default: false },
    category: { type: String, enum: [...DOCUMENT_CATEGORIES, null], default: null },
    seedPrompt: { type: String, default: "", maxlength: 2000 },
    chatMessages: { type: [mongoose.Schema.Types.Mixed], default: [] },
    typography: {
      fontFamily: { type: String, default: "Georgia" },
      fontSizePt: { type: Number, default: 12, min: 8, max: 24 },
    },
    wordCount: { type: Number, default: 0, min: 0 },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);

DraftDocumentSchema.index({ clerkUid: 1, updatedAt: -1 });
DraftDocumentSchema.index({ clerkUid: 1, status: 1, updatedAt: -1 });

const DraftDocument = (mongoose.models["DraftDocument"] ||
  mongoose.model("DraftDocument", DraftDocumentSchema)) as mongoose.Model<DraftDocumentDoc>;

export default DraftDocument;
