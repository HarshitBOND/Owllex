import mongoose from "mongoose";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@/lib/document-categories";
import type { TemplateField } from "@/lib/templates/fields";

/**
 * The stable family record for a template. The fillable content itself is
 * versioned in DocumentTemplateVersion and never edited in place.
 *
 * bodyHtml and fields are kept here as a mirror of the latest published
 * version, so the library, the category counts and "start a new draft" keep
 * reading one document instead of joining on every list request. The mirror is
 * only ever written by publishTemplateVersion(), which writes it and the
 * snapshot together -- nothing else may touch it, or the two drift apart.
 *
 * Drafts never read the mirror. They pin fieldsVersion and resolve against the
 * snapshot, which is what keeps a document stable while its template moves on.
 */

export interface DocumentTemplateDoc {
  _id: mongoose.Types.ObjectId;
  title: string;
  slug: string;
  description: string;
  category: DocumentCategory;
  bodyHtml: string;
  fields: TemplateField[];
  status: "draft" | "published" | "archived";
  latestVersion: number;
  supersededBy: mongoose.Types.ObjectId | null;
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
    fields: { type: [mongoose.Schema.Types.Mixed], default: [] },
    status: { type: String, enum: ["draft", "published", "archived"], default: "draft", index: true },
    latestVersion: { type: Number, default: 1, min: 1 },
    // Set when a newer import supersedes this form. Superseded families are
    // archived rather than deleted: drafts reference templateId, and deleting
    // one orphans every document already drafted from it.
    supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: "DocumentTemplate", default: null },
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
