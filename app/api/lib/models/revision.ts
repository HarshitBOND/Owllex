import mongoose from "mongoose"

/**
 * One AI edit, named by the instruction that produced it.
 *
 * Shared by ContractReview and DraftDocument: both hold a `contentHtml` a model
 * rewrites in place, and before this the previous wording was simply gone. The
 * row is what makes an edit readable and reversible after the fact.
 */
export type RevisionStatus = "pending" | "done" | "cancelled" | "error"

export interface RevisionDoc {
  id: string
  instruction: string
  status: RevisionStatus
  errorMessage: string
  scope: { selectedText: string; from: number; to: number }
  contentHtmlBefore: string
  modelKey: string
  createdAt: Date
}

/**
 * How many revisions keep their restore point.
 *
 * `contentHtmlBefore` is a whole document, and `contentHtml` is capped at 400k
 * chars -- a 300KB contract revised fifteen times is a 4.5MB row, close enough
 * to Mongo's 16MB ceiling to matter and slow on every findOne along the way.
 * Past this many, the oldest row's snapshot is emptied: the row stays in the
 * timeline as history, it just stops being somewhere you can go back to.
 */
export const MAX_REVISIONS = 20

export const RevisionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    instruction: { type: String, required: true, maxlength: 2000 },
    status: {
      type: String,
      enum: ["pending", "done", "cancelled", "error"],
      default: "pending",
    },
    errorMessage: { type: String, default: "" },
    // Empty when the revision covered the whole document.
    scope: {
      selectedText: { type: String, default: "", maxlength: 8000 },
      from: { type: Number, default: 0 },
      to: { type: Number, default: 0 },
    },
    // The document as it stood before this revision. Emptied once trimmed.
    contentHtmlBefore: { type: String, default: "", maxlength: 400000 },
    modelKey: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

export const REVISIONS_FIELD = { type: [RevisionSchema], default: [] }

/**
 * Drops the restore point from the oldest revisions once there are more than
 * MAX_REVISIONS of them. Mutates in place, returns the same array.
 */
export function trimRevisionSnapshots<T extends { contentHtmlBefore?: string }>(revisions: T[]) {
  const overflow = revisions.length - MAX_REVISIONS
  for (let i = 0; i < overflow; i++) {
    revisions[i].contentHtmlBefore = ""
  }
  return revisions
}
