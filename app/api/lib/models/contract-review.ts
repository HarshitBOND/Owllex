import mongoose from "mongoose"
import { REVISIONS_FIELD, type RevisionDoc } from "./revision"

export type IssueSeverity = "critical" | "warning" | "suggestion" | "info"

export interface ContractIssueDoc {
  id: string
  severity: IssueSeverity
  title: string
  description: string
  quote: string
  redline: string
}

export interface ContractReviewDoc {
  _id: mongoose.Types.ObjectId
  clerkUid: string
  fileName: string
  mimeType: string
  size: number
  r2Key: string
  extractedText: string
  contentHtml: string
  typography: { fontFamily: string; fontSizePt: number }
  status: "extracting" | "extracted" | "analyzing" | "ready" | "error"
  errorMessage: string
  issues: ContractIssueDoc[]
  summary: { riskLevel: "Low" | "Medium" | "High"; summary: string; recommendations: string[] } | null
  chatMessages: unknown[]
  /** Pages in the uploaded original; 0 when the backend reported none. */
  pageCount: number
  revisions: RevisionDoc[]
  version: number
  createdAt: Date
  updatedAt: Date
}

const ContractIssueSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    severity: { type: String, enum: ["critical", "warning", "suggestion", "info"], required: true },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 2000 },
    quote: { type: String, default: "", maxlength: 2000 },
    redline: { type: String, default: "", maxlength: 2000 },
  },
  { _id: false },
)

const ContractReviewSchema = new mongoose.Schema(
  {
    clerkUid: { type: String, required: true, index: true },
    fileName: { type: String, required: true, maxlength: 260 },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    r2Key: { type: String, required: true },
    extractedText: { type: String, default: "", maxlength: 400000 },
    contentHtml: { type: String, default: "", maxlength: 400000 },
    typography: {
      fontFamily: { type: String, default: "var(--font-averia-serif-libre), Georgia, serif" },
      fontSizePt: { type: Number, default: 12, min: 8, max: 24 },
    },
    status: {
      type: String,
      enum: ["extracting", "extracted", "analyzing", "ready", "error"],
      default: "extracting",
    },
    errorMessage: { type: String, default: "" },
    issues: { type: [ContractIssueSchema], default: [] },
    summary: {
      type: new mongoose.Schema(
        {
          riskLevel: { type: String, enum: ["Low", "Medium", "High"] },
          summary: { type: String, maxlength: 2000 },
          recommendations: { type: [String], default: [] },
        },
        { _id: false },
      ),
      default: null,
    },
    chatMessages: { type: [mongoose.Schema.Types.Mixed], default: [] },
    pageCount: { type: Number, default: 0 },
    revisions: REVISIONS_FIELD,
    version: { type: Number, default: 0 },
  },
  { timestamps: true },
)

ContractReviewSchema.index({ clerkUid: 1, updatedAt: -1 })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const existingContractReviewModel = mongoose.models["ContractReview"] as mongoose.Model<any> | undefined

// Dev hot reload keeps the previously compiled schema, so a newly added path is
// missing until the process restarts -- and a `revisions` write would silently
// vanish. Same guard the other models use.
if (existingContractReviewModel) {
  if (!existingContractReviewModel.schema.path("revisions")) {
    existingContractReviewModel.schema.add({ revisions: REVISIONS_FIELD })
  }
  if (!existingContractReviewModel.schema.path("pageCount")) {
    existingContractReviewModel.schema.add({ pageCount: { type: Number, default: 0 } })
  }
}

const ContractReview = (existingContractReviewModel ||
  mongoose.model("ContractReview", ContractReviewSchema)) as mongoose.Model<ContractReviewDoc>

export default ContractReview
