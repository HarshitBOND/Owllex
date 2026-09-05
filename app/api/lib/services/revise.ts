import { streamText, smoothStream } from "ai"
import type mongoose from "mongoose"
import { modelFor } from "@/lib/ai/provider"
import { MODELS, type ModelKey } from "@/lib/ai/models"
import { trimDocumentForPrompt } from "@/lib/ai/document-context"
import { sanitizeDocumentHtml } from "@/app/api/lib/html/sanitizeHtml"
import { recordAiUsage } from "@/app/api/lib/services/aiUsage"
import { MAX_REVISIONS, trimRevisionSnapshots, type RevisionDoc } from "@/app/api/lib/models/revision"

/**
 * Shared body of both revision routes.
 *
 * Contract review and draft documents hold the same shape -- a `contentHtml`
 * the model rewrites, a `version` guarding concurrent saves, a `revisions`
 * timeline -- so the only real differences are the system prompt and the usage
 * label. Keeping one implementation is mostly about the diff: two copies of
 * this would drift, and a revision that can't be reverted is worse than no
 * revision at all.
 */

/** Anything with the four fields a revision touches. Both models qualify. */
export interface RevisableDoc {
  _id: mongoose.Types.ObjectId
  contentHtml: string
  revisions: RevisionDoc[]
  version: number
  save: () => Promise<unknown>
}

export interface RevisionSelection {
  from: number
  to: number
  text: string
}

interface StreamRevisionInput {
  clerkUid: string
  doc: RevisableDoc
  systemPrompt: string
  /** recordAiUsage label, e.g. "contract-revise". */
  feature: string
  modelKey: ModelKey
  instruction: string
  selection?: RevisionSelection | null
}

/** Cheap unique id; the timeline only needs these to be distinct within a doc. */
function nextRevisionId(existing: RevisionDoc[]) {
  return `r${existing.length + 1}-${Date.now().toString(36)}`
}

function buildPrompt(contentHtml: string, instruction: string, selection?: RevisionSelection | null) {
  if (selection && selection.text.trim()) {
    return [
      "Revise only the selected passage of this document.",
      "",
      "<instruction>",
      instruction,
      "</instruction>",
      "",
      "<selection>",
      selection.text,
      "</selection>",
      "",
      "<document>",
      trimDocumentForPrompt(contentHtml),
      "</document>",
      "",
      "Return only the revised selection.",
    ].join("\n")
  }

  return [
    "Revise this document.",
    "",
    "<instruction>",
    instruction,
    "</instruction>",
    "",
    "<document>",
    trimDocumentForPrompt(contentHtml),
    "</document>",
    "",
    "Return the complete revised document.",
  ].join("\n")
}

/**
 * Models still open with a fence now and then despite being told not to, and a
 * stray ```html lands in the editor as literal text.
 */
function stripFences(text: string) {
  return text
    .replace(/^\s*```(?:html)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim()
}

/**
 * Replaces `selection.text` in the document with what the model returned.
 *
 * Splicing on the editor's `from`/`to` is not possible here -- those are
 * ProseMirror positions over a node tree, and the server only has the HTML
 * string. Matching the selected text is what survives that gap; when the match
 * fails (the user edited during generation, or the selection spanned a tag
 * boundary and came back normalised) the document is left alone rather than
 * corrupted, and the caller reports it.
 */
export function spliceSelection(contentHtml: string, selectedText: string, replacement: string) {
  const index = contentHtml.indexOf(selectedText)
  if (index === -1) return null
  return contentHtml.slice(0, index) + replacement + contentHtml.slice(index + selectedText.length)
}

export function streamRevision({
  clerkUid,
  doc,
  systemPrompt,
  feature,
  modelKey,
  instruction,
  selection,
}: StreamRevisionInput) {
  const baseHtml = doc.contentHtml
  const revisionId = nextRevisionId(doc.revisions)

  const result = streamText({
    model: modelFor(modelKey),
    system: systemPrompt,
    prompt: buildPrompt(baseHtml, instruction, selection),
    maxOutputTokens: MODELS[modelKey].maxOutputTokens,
    experimental_transform: smoothStream({ chunking: "word" }),
    onFinish: async ({ text, usage }) => {
      const answer = stripFences(text)
      if (!answer) return

      const nextHtml = selection?.text
        ? spliceSelection(baseHtml, selection.text, answer)
        : answer
      // A selection that no longer matches means the document moved under us.
      // Recording the row as an error keeps the timeline honest about it.
      if (nextHtml === null) {
        doc.revisions.push({
          id: revisionId,
          instruction,
          status: "error",
          errorMessage:
            "The selected passage changed while the revision was generating, so it wasn't applied. Select it again and retry.",
          scope: { selectedText: selection?.text ?? "", from: selection?.from ?? 0, to: selection?.to ?? 0 },
          contentHtmlBefore: "",
          modelKey,
          createdAt: new Date(),
        })
        await doc.save()
        return
      }

      doc.revisions.push({
        id: revisionId,
        instruction,
        status: "done",
        errorMessage: "",
        scope: {
          selectedText: selection?.text ?? "",
          from: selection?.from ?? 0,
          to: selection?.to ?? 0,
        },
        contentHtmlBefore: baseHtml,
        modelKey,
        createdAt: new Date(),
      })
      trimRevisionSnapshots(doc.revisions)

      doc.contentHtml = sanitizeDocumentHtml(nextHtml)
      doc.version += 1
      await doc.save()

      await recordAiUsage({ clerkUid, feature, modelKey, usage })
    },
    onError: async () => {
      // Nothing is written to contentHtml on failure -- the client keeps what
      // it had, and an aborted generation is simply absent from the timeline.
    },
  })

  return { result, revisionId }
}

export { MAX_REVISIONS }

/**
 * Rolls the document back to how it stood before `revisionId`, discarding that
 * revision and every one after it.
 *
 * Reverting to the middle of a stack and keeping the later revisions would mean
 * replaying edits against text they were never written for, which produces
 * plausible-looking nonsense. Truncating is the honest option, and the UI warns
 * before calling this.
 */
export function revertToRevision(doc: RevisableDoc, revisionId: string) {
  const index = doc.revisions.findIndex((revision) => revision.id === revisionId)
  if (index === -1) return { ok: false as const, error: "That revision no longer exists." }

  const target = doc.revisions[index]
  if (!target.contentHtmlBefore) {
    return {
      ok: false as const,
      error: `This revision is too far back to restore -- only the last ${MAX_REVISIONS} keep a copy of the document.`,
    }
  }

  doc.contentHtml = target.contentHtmlBefore
  doc.revisions = doc.revisions.slice(0, index)
  doc.version += 1
  return { ok: true as const }
}
