import mongoose from "mongoose"
import DocumentTemplate from "@/app/api/lib/models/document-template"
import DocumentTemplateVersion, {
  type DocumentTemplateVersionDoc,
} from "@/app/api/lib/models/document-template-version"
import type { TemplateField } from "@/lib/templates/fields"

// Pure version logic lives in lib/ so it can be tested without a database.
export { diffFields, migrateValues } from "@/lib/templates/versioning"

/**
 * The one write path for template content.
 *
 * Every edit creates a new immutable snapshot and re-points the family's
 * mirror at it. Both happen here so they cannot drift: nothing else in the
 * codebase may write DocumentTemplate.bodyHtml or .fields directly.
 */

export type VersionInput = {
  bodyHtml: string
  fields: TemplateField[]
  sourcePdf?: DocumentTemplateVersionDoc["sourcePdf"]
  renderMode?: "html" | "pdf-overlay"
  changeNote?: string
}

/**
 * Claims the next version number and writes the snapshot.
 *
 * The number comes from an atomic $inc rather than a read-then-write, because
 * two admins publishing at the same moment would otherwise both compute N+1 and
 * the second would collide on the unique {templateId, version} index. Claiming
 * first means the losing writer simply gets the following number.
 */
export async function publishTemplateVersion(opts: {
  templateId: mongoose.Types.ObjectId | string
  input: VersionInput
  userId: mongoose.Types.ObjectId | string
  /** Mirrors the snapshot onto the family, so the library and new drafts see it. */
  makeLatest?: boolean
}) {
  const { templateId, input, userId } = opts
  const makeLatest = opts.makeLatest !== false

  const claimed = await DocumentTemplate.findByIdAndUpdate(
    templateId,
    { $inc: { latestVersion: 1 } },
    { new: true, projection: { latestVersion: 1 } }
  ).lean()

  if (!claimed) throw new Error("Template not found")

  const version = await DocumentTemplateVersion.create({
    templateId,
    version: claimed.latestVersion,
    bodyHtml: input.bodyHtml,
    fields: input.fields,
    sourcePdf: input.sourcePdf ?? null,
    renderMode: input.renderMode ?? "html",
    changeNote: input.changeNote ?? "",
    createdBy: userId,
    publishedAt: new Date(),
  })

  if (makeLatest) {
    await DocumentTemplate.updateOne(
      { _id: templateId },
      { $set: { bodyHtml: input.bodyHtml, fields: input.fields, updatedBy: userId } }
    )
  }

  return version
}

/** Writes version 1 alongside a freshly created family. */
export async function seedFirstVersion(opts: {
  templateId: mongoose.Types.ObjectId | string
  input: VersionInput
  userId: mongoose.Types.ObjectId | string
}) {
  return DocumentTemplateVersion.create({
    templateId: opts.templateId,
    version: 1,
    bodyHtml: opts.input.bodyHtml,
    fields: opts.input.fields,
    sourcePdf: opts.input.sourcePdf ?? null,
    renderMode: opts.input.renderMode ?? "html",
    changeNote: opts.input.changeNote ?? "",
    createdBy: opts.userId,
    publishedAt: new Date(),
  })
}

/**
 * Resolves the snapshot a draft is pinned to.
 *
 * Falls back to the family mirror only for drafts created before versioning
 * existed (fieldsVersion 0), which have no snapshot to point at and no fields
 * to fill -- they render exactly as they always did.
 */
export async function resolveSnapshot(
  templateId: mongoose.Types.ObjectId | string | null,
  fieldsVersion: number
): Promise<{ bodyHtml: string; fields: TemplateField[]; renderMode: "html" | "pdf-overlay"; sourcePdf: DocumentTemplateVersionDoc["sourcePdf"]; version: number } | null> {
  if (!templateId) return null

  if (fieldsVersion > 0) {
    const snapshot = await DocumentTemplateVersion.findOne({ templateId, version: fieldsVersion }).lean()
    if (snapshot) {
      return {
        bodyHtml: snapshot.bodyHtml,
        fields: snapshot.fields || [],
        renderMode: snapshot.renderMode,
        sourcePdf: snapshot.sourcePdf,
        version: snapshot.version,
      }
    }
  }

  const family = await DocumentTemplate.findById(templateId).lean()
  if (!family) return null
  return {
    bodyHtml: family.bodyHtml,
    fields: (family.fields as TemplateField[]) || [],
    renderMode: "html",
    sourcePdf: null,
    version: family.latestVersion ?? 1,
  }
}
