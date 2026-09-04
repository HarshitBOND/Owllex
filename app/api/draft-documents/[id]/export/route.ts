import { NextRequest, NextResponse } from "next/server"
import { objectIdSchema, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DraftDocument from "@/app/api/lib/models/draft-document"
import DocumentTemplateVersion from "@/app/api/lib/models/document-template-version"
import { htmlToBlocks } from "@/app/api/lib/export/htmlBlocks"
import { renderPdf } from "@/app/api/lib/export/pdf"
import { renderDocx } from "@/app/api/lib/export/docx"
import { renderPdfOverlay, type StampWarning } from "@/app/api/lib/export/pdfOverlay"
import { getPrivateObject } from "@/app/api/lib/storage/r2"
import type { TemplateField } from "@/lib/templates/fields"

export const maxDuration = 60

const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  const format = new URL(request.url).searchParams.get("format") === "docx" ? "docx" : "pdf"

  await connectMongoWithRetry()
  const draft = await DraftDocument.findOne({ _id: id, clerkUid: userContext.clerkUid }).lean()
  if (!draft) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  // DOCX always takes the HTML path: there is no meaningful Word equivalent of
  // stamping values onto a fixed PDF.
  let stampWarnings: StampWarning[] = []
  let buffer: Buffer | Uint8Array | null = null

  if (format === "pdf" && draft.templateId && draft.fieldsVersion > 0) {
    const snapshot = await DocumentTemplateVersion.findOne({
      templateId: draft.templateId,
      version: draft.fieldsVersion,
    })
      .select("renderMode sourcePdf fields")
      .lean()

    if (snapshot?.renderMode === "pdf-overlay" && snapshot.sourcePdf?.r2Key) {
      try {
        const source = await getPrivateObject(snapshot.sourcePdf.r2Key)
        if (source.body) {
          const result = await renderPdfOverlay(
            source.body,
            (snapshot.fields as TemplateField[]) || [],
            draft.fieldValues || {}
          )
          buffer = result.bytes
          stampWarnings = result.warnings
        }
      } catch (error) {
        // Falls through to the HTML rebuild rather than failing the download.
        // The advocate gets a usable document either way, and the header below
        // tells them the exact copy was not the one produced.
        console.error("PDF stamping failed for draft", id, error)
        stampWarnings = [
          {
            key: "__stamp__",
            label: "Exact court format",
            reason:
              "could not be produced, so this is the app's rebuild of the form rather than the court's own PDF",
          },
        ]
      }
    }
  }

  if (!buffer) {
    const blocks = htmlToBlocks(draft.contentHtml || "")
    const options = {
      title: draft.title || "Document",
      fontFamily: draft.typography?.fontFamily || "Georgia",
      fontSizePt: draft.typography?.fontSizePt || 12,
    }
    buffer = format === "docx" ? await renderDocx(blocks, options) : await renderPdf(blocks, options)
  }

  // Strips quotes and CR/LF so the title cannot inject a response header.
  const safeName =
    (draft.title || "document").replace(/[^\w\s.-]+/g, "").trim().slice(0, 80) || "document"

  const headers: Record<string, string> = {
    "Content-Type": MIME[format],
    "Content-Disposition": `attachment; filename="${safeName}.${format}"`,
  }

  // Anything that did not fit, or did not stamp, travels with the download so
  // the editor can say so. A value silently clipped off a court form is the
  // failure worth shouting about. Percent-encoded because a field label can be
  // Devanagari and headers are latin1.
  if (stampWarnings.length > 0) {
    headers["X-Stamp-Warnings"] = encodeURIComponent(JSON.stringify(stampWarnings))
    headers["Access-Control-Expose-Headers"] = "X-Stamp-Warnings"
  }

  return new NextResponse(new Uint8Array(buffer), { status: 200, headers })
}
