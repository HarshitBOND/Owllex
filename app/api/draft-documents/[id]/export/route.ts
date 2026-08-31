import { NextRequest, NextResponse } from "next/server"
import { objectIdSchema, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DraftDocument from "@/app/api/lib/models/draft-document"
import { htmlToBlocks } from "@/app/api/lib/export/htmlBlocks"
import { renderPdf } from "@/app/api/lib/export/pdf"
import { renderDocx } from "@/app/api/lib/export/docx"

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

  const blocks = htmlToBlocks(draft.contentHtml || "")
  const options = {
    title: draft.title || "Document",
    fontFamily: draft.typography?.fontFamily || "Georgia",
    fontSizePt: draft.typography?.fontSizePt || 12,
  }

  const buffer = format === "docx" ? await renderDocx(blocks, options) : await renderPdf(blocks, options)

  // Strips quotes and CR/LF so the title cannot inject a response header.
  const safeName =
    (draft.title || "document").replace(/[^\w\s.-]+/g, "").trim().slice(0, 80) || "document"

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": MIME[format],
      "Content-Disposition": `attachment; filename="${safeName}.${format}"`,
    },
  })
}
