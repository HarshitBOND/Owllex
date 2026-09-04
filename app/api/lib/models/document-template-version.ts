import mongoose from "mongoose";
import { COLUMN_TYPES, FIELD_TYPES, type TemplateField } from "@/lib/templates/fields";

/**
 * An immutable snapshot of one version of a template's fillable content.
 *
 * DocumentTemplate stays the stable family record -- title, category, status,
 * the thing a draft's templateId points at -- while the body, the field list
 * and the overlay coordinates live here and are never edited in place. An admin
 * edit writes version N+1; version N is left exactly as it was.
 *
 * That is what lets a draft pin the version it was started on. Without it, an
 * admin republishing a form would silently change a document an advocate was
 * part way through filing, and -- once stamping is in play -- would leave
 * coordinates pointing at a body that had moved underneath them.
 */

const OverlayColumnSchema = new mongoose.Schema(
  {
    x: { type: Number, required: true },
    width: { type: Number, required: true },
    align: { type: String, enum: ["left", "center", "right"], default: "left" },
  },
  { _id: false }
);

const OverlaySchema = new mongoose.Schema(
  {
    page: { type: Number, required: true, min: 0 },
    // PDF user space, origin bottom-left -- pdf-lib's own system, so the y-axis
    // is flipped once in the admin mapper and never again at draw time.
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    fontSize: { type: Number, default: 10, min: 4, max: 72 },
    align: { type: String, enum: ["left", "center", "right"], default: "left" },
    rowHeight: { type: Number, default: null },
    maxRows: { type: Number, default: null },
    columns: { type: Map, of: OverlayColumnSchema, default: undefined },
  },
  { _id: false }
);

const ColumnSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: COLUMN_TYPES, default: "text" },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: false },
  },
  { _id: false }
);

const FieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    help: { type: String, default: "" },
    type: { type: String, enum: FIELD_TYPES, default: "text" },
    options: { type: [String], default: [] },
    columns: { type: [ColumnSchema], default: [] },
    required: { type: Boolean, default: false },
    group: { type: String, default: "" },
    // "case.courtName" and the like: a hint, never a guarantee. An unresolved
    // source falls through to being asked rather than leaving a blank.
    source: { type: String, default: null },
    overlay: { type: OverlaySchema, default: null },
  },
  { _id: false }
);

const SourcePdfSchema = new mongoose.Schema(
  {
    r2Key: { type: String, required: true },
    filename: { type: String, default: "" },
    sizeBytes: { type: Number, default: 0 },
    sha256: { type: String, default: "" },
    pageCount: { type: Number, default: 0 },
  },
  { _id: false }
);

export interface DocumentTemplateVersionDoc {
  _id: mongoose.Types.ObjectId;
  templateId: mongoose.Types.ObjectId;
  version: number;
  bodyHtml: string;
  fields: TemplateField[];
  sourcePdf: {
    r2Key: string;
    filename: string;
    sizeBytes: number;
    sha256: string;
    pageCount: number;
  } | null;
  renderMode: "html" | "pdf-overlay";
  changeNote: string;
  createdBy: mongoose.Types.ObjectId | string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentTemplateVersionSchema = new mongoose.Schema(
  {
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "DocumentTemplate", required: true },
    version: { type: Number, required: true, min: 1 },
    bodyHtml: { type: String, required: true, maxlength: 200000 },
    fields: { type: [FieldSchema], default: [] },
    sourcePdf: { type: SourcePdfSchema, default: null },
    // "html" rebuilds the form and stays editable; "pdf-overlay" stamps values
    // onto the court's own PDF. The HTML body is kept in both modes -- it is
    // what the editor, the preview and the AI work against.
    renderMode: { type: String, enum: ["html", "pdf-overlay"], default: "html" },
    changeNote: { type: String, default: "", maxlength: 400 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

DocumentTemplateVersionSchema.index({ templateId: 1, version: -1 }, { unique: true });

const DocumentTemplateVersion = (mongoose.models["DocumentTemplateVersion"] ||
  mongoose.model(
    "DocumentTemplateVersion",
    DocumentTemplateVersionSchema
  )) as mongoose.Model<DocumentTemplateVersionDoc>;

export default DocumentTemplateVersion;
