import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAdmin, logAdminAction } from "@/app/api/lib/adminMiddleware"
import { objectIdSchema, parseAndValidateJson } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DocumentTemplate from "@/app/api/lib/models/document-template"
import DocumentTemplateVersion from "@/app/api/lib/models/document-template-version"
import DraftDocument from "@/app/api/lib/models/draft-document"
import { publishTemplateVersion } from "@/app/api/lib/services/templateVersions"
import { assertTemplateConsistent } from "@/app/api/lib/documentTemplates"
import type { TemplateField } from "@/lib/templates/fields"

/**
 * Applies the admin's decision about a suspected duplicate.
 *
 * Nothing here runs automatically. Each branch is something a person chose
 * after reading the two forms side by side.
 */

const bodySchema = z.object({
  importId: z.string().refine((v) => objectIdSchema.safeParse(v).success, "Invalid id"),
  action: z.enum(["discard", "supersede", "keep"]),
  targetId: z
    .string()
    .refine((v) => objectIdSchema.safeParse(v).success, "Invalid id")
    .optional(),
})

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (admin instanceof NextResponse) return admin

  const parsed = await parseAndValidateJson(request, bodySchema)
  if (!parsed.success) return parsed.response

  const { importId, action, targetId } = parsed.data

  await connectMongoWithRetry()

  const imported = await DocumentTemplate.findById(importId)
  if (!imported) {
    return NextResponse.json({ success: false, error: "Import not found" }, { status: 404 })
  }

  // Every branch below removes or consumes the import, so it has to still be an
  // unpublished draft. Once it is published it is a template in its own right
  // and this is no longer a dedupe decision.
  if (action !== "keep" && imported.status !== "draft") {
    return NextResponse.json(
      {
        success: false,
        error: `"${imported.title}" has already been published, so it can't be resolved as an import any more.`,
      },
      { status: 409 }
    )
  }

  if (action === "keep") {
    return NextResponse.json({
      success: true,
      action,
      message: `Kept both. "${imported.title}" stays a draft until you publish it.`,
    })
  }

  if (action === "discard") {
    await DocumentTemplateVersion.deleteMany({ templateId: imported._id })
    await DocumentTemplate.findByIdAndDelete(imported._id)

    await logAdminAction(admin.dbUserId, "discarded_duplicate_template", request, {
      targetType: "document",
      targetId: importId,
      details: `Discarded duplicate import "${imported.title}"`,
    })

    return NextResponse.json({
      success: true,
      action,
      message: `Discarded "${imported.title}". Nothing published was touched.`,
    })
  }

  // --- supersede ---

  if (!targetId) {
    return NextResponse.json(
      { success: false, error: "Superseding needs the template being replaced." },
      { status: 400 }
    )
  }

  const target = await DocumentTemplate.findById(targetId)
  if (!target) {
    return NextResponse.json({ success: false, error: "Template being replaced not found" }, { status: 404 })
  }

  const fields = (imported.fields as TemplateField[]) || []
  const inconsistent = assertTemplateConsistent(imported.bodyHtml, fields)
  if (inconsistent) {
    return NextResponse.json(
      {
        success: false,
        error: `This import can't replace a published form until its body and fields agree. ${inconsistent}`,
      },
      { status: 400 }
    )
  }

  // The new content becomes the next version of the EXISTING family rather than
  // replacing the row. That keeps templateId stable, so every draft already made
  // from this form still resolves -- and each of those drafts stays pinned to the
  // version it was started on, so none of them changes underneath its author.
  const version = await publishTemplateVersion({
    templateId: target._id,
    userId: admin.dbUserId,
    input: {
      bodyHtml: imported.bodyHtml,
      fields,
      sourcePdf: (
        await DocumentTemplateVersion.findOne({ templateId: imported._id })
          .sort({ version: -1 })
          .select("sourcePdf")
          .lean()
      )?.sourcePdf,
      renderMode: "html",
      changeNote: `Superseded by the import "${imported.title}"`,
    },
  })

  target.description = imported.description || target.description
  target.category = imported.category
  target.status = "published"
  target.publishedAt = target.publishedAt ?? new Date()
  target.updatedBy = admin.dbUserId
  await target.save()

  await DocumentTemplateVersion.deleteMany({ templateId: imported._id })
  await DocumentTemplate.findByIdAndDelete(imported._id)

  const affectedDrafts = await DraftDocument.countDocuments({ templateId: target._id })

  await logAdminAction(admin.dbUserId, "superseded_document_template", request, {
    targetType: "document",
    targetId: String(target._id),
    details: `"${target.title}" superseded by import "${imported.title}" as version ${version.version}`,
  })

  return NextResponse.json({
    success: true,
    action,
    version: version.version,
    affectedDrafts,
    message:
      affectedDrafts > 0
        ? `"${target.title}" is now at version ${version.version}. ${affectedDrafts} existing ${
            affectedDrafts === 1 ? "document keeps" : "documents keep"
          } the version they were started on, and will offer to update.`
        : `"${target.title}" is now at version ${version.version}.`,
  })
}
