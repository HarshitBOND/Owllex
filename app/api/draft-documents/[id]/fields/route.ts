import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { objectIdSchema, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DraftDocument from "@/app/api/lib/models/draft-document"
import DocumentTemplateVersion from "@/app/api/lib/models/document-template-version"
import { sanitizeDocumentHtml } from "@/app/api/lib/html/sanitizeHtml"
import { recordFacts, syncFactSheet } from "@/app/api/lib/services/corpusFacts"
import { renderTemplate } from "@/lib/templates/render"
import { plainTextOf } from "@/lib/templates/similarity"
import type { TemplateField } from "@/lib/templates/fields"

/**
 * Revises a draft's answers and re-renders the document from them.
 *
 * Re-rendering replaces the whole body, which would silently destroy anything
 * the advocate typed straight into the editor. So the current body is compared
 * against what the stored answers would produce: if they differ, the edit is
 * refused with a 409 and the client asks before sending `force`.
 */

const bodySchema = z.object({
  fieldValues: z.record(z.string(), z.unknown()),
  fieldProvenance: z.record(z.string(), z.unknown()).optional(),
  rememberInCorpus: z.boolean().optional(),
  /** Set only after the advocate has been told hand edits will be lost. */
  force: z.boolean().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  const parsed = await parseAndValidateJson(request, bodySchema)
  if (!parsed.success) return parsed.response

  await connectMongoWithRetry()

  const draft = await DraftDocument.findOne({ _id: id, clerkUid: userContext.clerkUid })
  if (!draft) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }
  if (!draft.templateId || !draft.fieldsVersion) {
    return NextResponse.json(
      { success: false, error: "This document wasn't started from a form, so it has no fields to fill." },
      { status: 400 }
    )
  }

  // Resolved against the pinned snapshot, never the template's latest.
  const snapshot = await DocumentTemplateVersion.findOne({
    templateId: draft.templateId,
    version: draft.fieldsVersion,
  }).lean()

  if (!snapshot) {
    return NextResponse.json(
      { success: false, error: "The version of the form this document was started on is missing." },
      { status: 404 }
    )
  }

  const fields = (snapshot.fields as TemplateField[]) || []

  if (!parsed.data.force) {
    // Compared as text: the editor rewrites whitespace and attribute order on
    // every load, so a byte compare would report hand edits on every document.
    const expected = plainTextOf(renderTemplate(snapshot.bodyHtml, fields, draft.fieldValues || {}))
    const actual = plainTextOf(draft.contentHtml || "")
    if (expected !== actual) {
      return NextResponse.json(
        {
          success: false,
          error: "edited_by_hand",
          message:
            "This document has been edited directly since it was filled in. Updating the answers will rewrite it and those edits will be lost.",
        },
        { status: 409 }
      )
    }
  }

  const values = parsed.data.fieldValues
  draft.fieldValues = values
  if (parsed.data.fieldProvenance) {
    draft.fieldProvenance = parsed.data.fieldProvenance as typeof draft.fieldProvenance
  }
  if (parsed.data.rememberInCorpus !== undefined) {
    draft.rememberInCorpus = parsed.data.rememberInCorpus
  }
  draft.contentHtml = sanitizeDocumentHtml(renderTemplate(snapshot.bodyHtml, fields, values))
  draft.version += 1
  await draft.save()

  // Revising an answer supersedes the fact it was recorded as, so the corpus
  // reflects what the document says now rather than what it first said.
  if (draft.corpusId && draft.rememberInCorpus) {
    try {
      await recordFacts({
        clerkUid: userContext.clerkUid,
        corpusId: draft.corpusId,
        fields,
        values,
        provenance: draft.fieldProvenance as Record<string, { source?: string }>,
        draftId: draft._id,
        templateId: draft.templateId,
        templateVersion: draft.fieldsVersion,
      })
      await syncFactSheet({ clerkUid: userContext.clerkUid, corpusId: draft.corpusId })
    } catch (error) {
      console.error("Corpus write-back failed for draft", String(draft._id), error)
    }
  }

  return NextResponse.json({
    success: true,
    contentHtml: draft.contentHtml,
    version: draft.version,
  })
}
