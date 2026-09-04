import { NextRequest, NextResponse } from "next/server"
import { objectIdSchema, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DraftDocument from "@/app/api/lib/models/draft-document"
import DocumentTemplate from "@/app/api/lib/models/document-template"
import DocumentTemplateVersion from "@/app/api/lib/models/document-template-version"
import { sanitizeDocumentHtml } from "@/app/api/lib/html/sanitizeHtml"
import { diffFields, migrateValues } from "@/app/api/lib/services/templateVersions"
import { renderTemplate } from "@/lib/templates/render"
import type { TemplateField } from "@/lib/templates/fields"

/**
 * Moving a draft onto a newer version of its template.
 *
 * GET reports what changed so the advocate can judge whether it is worth it.
 * POST creates a migrated COPY and never touches the original -- a document part
 * way through being filed is not something to rewrite in place on the strength
 * of one click.
 */

async function load(clerkUid: string, id: string) {
  const draft = await DraftDocument.findOne({ _id: id, clerkUid }).lean()
  if (!draft?.templateId || !draft.fieldsVersion) return null

  const family = await DocumentTemplate.findById(draft.templateId).select("latestVersion title").lean()
  if (!family) return null

  const latestVersion = family.latestVersion ?? 1
  const [from, to] = await Promise.all([
    DocumentTemplateVersion.findOne({ templateId: draft.templateId, version: draft.fieldsVersion }).lean(),
    DocumentTemplateVersion.findOne({ templateId: draft.templateId, version: latestVersion }).lean(),
  ])
  if (!from || !to) return null

  return { draft, family, latestVersion, from, to }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  await connectMongoWithRetry()
  const loaded = await load(userContext.clerkUid, id)
  if (!loaded) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  const { draft, latestVersion, from, to } = loaded
  const fromFields = (from.fields as TemplateField[]) || []
  const toFields = (to.fields as TemplateField[]) || []

  const changes = diffFields(fromFields, toFields)
  const { dropped } = migrateValues(draft.fieldValues || {}, fromFields, toFields)

  return NextResponse.json({
    success: true,
    fromVersion: draft.fieldsVersion,
    toVersion: latestVersion,
    changeNote: to.changeNote || "",
    publishedAt: to.publishedAt,
    added: changes.added.map((f) => ({ key: f.key, label: f.label, required: f.required })),
    removed: changes.removed.map((f) => ({ key: f.key, label: f.label })),
    retyped: changes.retyped.map((f) => ({ key: f.key, label: f.label, type: f.type })),
    relabelled: changes.relabelled.map((f) => ({
      key: f.key,
      from: fromFields.find((x) => x.key === f.key)?.label ?? "",
      to: f.label,
    })),
    // What an update would cost the advocate: named up front, not discovered
    // afterwards.
    dropped,
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  await connectMongoWithRetry()
  const loaded = await load(userContext.clerkUid, id)
  if (!loaded) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  const { draft, latestVersion, from, to } = loaded

  if (latestVersion === draft.fieldsVersion) {
    return NextResponse.json(
      { success: false, error: "This document is already on the latest version of the form." },
      { status: 409 }
    )
  }

  const fromFields = (from.fields as TemplateField[]) || []
  const toFields = (to.fields as TemplateField[]) || []
  const { values, dropped } = migrateValues(draft.fieldValues || {}, fromFields, toFields)

  // Provenance follows the values that survived, so a value carried across is
  // still shown as having come from the case or the corpus.
  const provenance: Record<string, unknown> = {}
  for (const key of Object.keys(values)) {
    const existing = (draft.fieldProvenance as Record<string, unknown>)?.[key]
    if (existing) provenance[key] = existing
  }

  const copy = await DraftDocument.create({
    clerkUid: userContext.clerkUid,
    title: `${draft.title} (v${latestVersion})`,
    contentHtml: sanitizeDocumentHtml(renderTemplate(to.bodyHtml, toFields, values)),
    status: "draft",
    templateId: draft.templateId,
    templateTitle: draft.templateTitle,
    fieldsVersion: latestVersion,
    fieldValues: values,
    fieldProvenance: provenance,
    caseId: draft.caseId,
    corpusId: draft.corpusId,
    rememberInCorpus: draft.rememberInCorpus,
    category: draft.category,
    seedPrompt: draft.seedPrompt,
    typography: draft.typography,
  })

  return NextResponse.json(
    {
      success: true,
      id: String(copy._id),
      fromVersion: draft.fieldsVersion,
      toVersion: latestVersion,
      dropped,
      message:
        dropped.length === 0
          ? `Copied onto version ${latestVersion}. Your original document is untouched.`
          : `Copied onto version ${latestVersion}. ${dropped.length} ${
              dropped.length === 1 ? "answer" : "answers"
            } could not be carried across. Your original document is untouched.`,
    },
    { status: 201 }
  )
}
