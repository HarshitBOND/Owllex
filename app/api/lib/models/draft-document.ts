import mongoose from "mongoose";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@/lib/document-categories";

export interface DraftDocumentDoc {
  _id: mongoose.Types.ObjectId;
  clerkUid: string;
  title: string;
  contentHtml: string;
  status: "draft" | "final";
  templateId: mongoose.Types.ObjectId | string | null;
  templateTitle: string;
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
