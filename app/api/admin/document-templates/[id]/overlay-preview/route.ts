import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAdmin } from "@/app/api/lib/adminMiddleware"
import { objectIdSchema, parseAndValidateJson } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DocumentTemplate from "@/app/api/lib/models/document-template"
import DocumentTemplateVersion from "@/app/api/lib/models/document-template-version"
import { getPrivateObject } from "@/app/api/lib/storage/r2"
import { renderPdfOverlay } from "@/app/api/lib/export/pdfOverlay"
import { fieldsSchema, type TemplateField } from "@/lib/templates/fields"

/**
 * Stamps placeholder values through the real renderer so an admin can see fit
 * and alignment before publishing.
 *
 * Deliberately uses renderPdfOverlay rather than a lookalike: a preview drawn
 * by different code would not catch the thing it exists to catch -- a box too
 * narrow for a real name, or a row pitch that walks off the printed table.
 */
export const maxDuration = 60

const bodySchema = z.object({
  // Sent unsaved, so positions can be checked before they are committed.
  fields: fieldsSchema,
})

/** Long enough to expose a box that is too tight, in each script the fonts cover. */
const SAMPLES: Record<string, string> = {
  text: "Sohan Singh s/o Gurdial Singh",
  longtext: "Sohan Singh s/o Gurdial Singh, resident of Naraingarh, Tehsil Naraingarh",
  date: "2026-10-14",
  number: "412",
}

function sampleFor(field: TemplateField): unknown {
  if (field.type === "select") return field.options[0] ?? "Defendant"
  return SAMPLES[field.type] ?? SAMPLES.text
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request)
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 })
  }

  const parsed = await parseAndValidateJson(request, bodySchema)
  if (!parsed.success) return parsed.response

  await connectMongoWithRetry()

  const template = await DocumentTemplate.findById(id).select("latestVersion title").lean()
  if (!template) {
    return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 })
  }

  const snapshot = await DocumentTemplateVersion.findOne({
    templateId: id,
    "sourcePdf.r2Key": { $ne: null },
  })
    .sort({ version: -1 })
    .select("sourcePdf")
    .lean()

  if (!snapshot?.sourcePdf?.r2Key) {
    return NextResponse.json(
      { success: false, error: "This template has no court PDF behind it, so there is nothing to stamp onto." },
      { status: 404 }
    )
  }

  const source = await getPrivateObject(snapshot.sourcePdf.r2Key)
  if (!source.ok || !source.body) {
    return NextResponse.json({ success: false, error: "The original PDF could not be read." }, { status: 502 })
  }

  const fields = parsed.data as unknown as { fields: TemplateField[] }
  const values: Record<string, unknown> = {}

  for (const field of fields.fields) {
    if (field.type === "table") {
      const rows = field.overlay?.maxRows ?? 3
      values[field.key] = Array.from({ length: rows }, (_, i) =>
        Object.fromEntries(field.columns.map((c) => [c.key, `${SAMPLES[c.type] ?? SAMPLES.text} ${i + 1}`]))
      )
      continue
    }
    values[field.key] = sampleFor(field)
  }

  const result = await renderPdfOverlay(source.body, fields.fields, values)

  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="preview.pdf"`,
  }
  if (result.warnings.length > 0) {
    headers["X-Stamp-Warnings"] = encodeURIComponent(JSON.stringify(result.warnings))
  }

  return new NextResponse(new Uint8Array(result.bytes), { status: 200, headers })
}
