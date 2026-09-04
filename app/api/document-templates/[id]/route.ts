import { NextRequest, NextResponse } from "next/server"
import { objectIdSchema, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DocumentTemplate from "@/app/api/lib/models/document-template"
import DocumentTemplateVersion from "@/app/api/lib/models/document-template-version"
import type { TemplateField } from "@/lib/templates/fields"

/**
 * One published template, with everything needed to fill it in.
 *
 * Serves the latest published version. A draft that has been started already
 * resolves against its own pinned snapshot instead, through
 * /api/draft-documents/[id].
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  await connectMongoWithRetry()

  const template = await DocumentTemplate.findOne({ _id: id, status: "published" }).lean()
  if (!template) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  const version = template.latestVersion ?? 1
  const snapshot = await DocumentTemplateVersion.findOne({ templateId: id, version }).lean()

  const fields = (snapshot?.fields as TemplateField[]) ?? (template.fields as TemplateField[]) ?? []

  return NextResponse.json({
    success: true,
    template: {
      id: String(template._id),
      title: template.title,
      description: template.description,
      category: template.category,
      usageCount: template.usageCount,
      version,
      bodyHtml: snapshot?.bodyHtml ?? template.bodyHtml,
      fields,
      renderMode: snapshot?.renderMode ?? "html",
      // The court's own PDF is fetched separately through .../source, which
      // signs a short-lived link rather than embedding one in every response.
      hasSourcePdf: !!snapshot?.sourcePdf?.r2Key,
      sourceFilename: snapshot?.sourcePdf?.filename ?? "",
      sourcePageCount: snapshot?.sourcePdf?.pageCount ?? 0,
    },
  })
}
