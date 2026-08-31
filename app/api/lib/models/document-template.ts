import mongoose from "mongoose";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@/lib/document-categories";

export interface DocumentTemplateDoc {
  _id: mongoose.Types.ObjectId;
  title: string;
  slug: string;
  description: string;
  category: DocumentCategory;
  bodyHtml: string;
  status: "draft" | "published";
  usageCount: number;
  createdBy: mongoose.Types.ObjectId | string;
  updatedBy: mongoose.Types.ObjectId | string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentTemplateSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: "", trim: true, maxlength: 400 },
    category: { type: String, required: true, enum: DOCUMENT_CATEGORIES },
    bodyHtml: { type: String, required: true, maxlength: 200000 },
    status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
    usageCount: { type: Number, default: 0, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

DocumentTemplateSchema.index({ status: 1, category: 1, title: 1 });
DocumentTemplateSchema.index({ status: 1, usageCount: -1 });
DocumentTemplateSchema.index({ status: 1, updatedAt: -1 });

const DocumentTemplate = (mongoose.models["DocumentTemplate"] ||
  mongoose.model("DocumentTemplate", DocumentTemplateSchema)) as mongoose.Model<DocumentTemplateDoc>;

export default DocumentTemplate;
