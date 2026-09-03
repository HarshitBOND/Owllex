import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, objectIdSchema, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DraftDocument from "@/app/api/lib/models/draft-document"
import { htmlToBlocks } from "@/app/api/lib/export/htmlBlocks"
import { renderPdf } from "@/app/api/lib/export/pdf"
import { renderDocx } from "@/app/api/lib/export/docx"
import { saveBufferToVault } from "@/app/api/lib/vault/copyToVault"

export const maxDuration = 60

const MIME: Record<"pdf" | "docx", string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `vault:save:draft-documents:${userContext.clerkUid}`,
    max: 40,
    windowMs: 10 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  const { id } = await params
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  const format = new URL(request.url).searchParams.get("format") === "docx" ? "docx" : "pdf"

  await connectMongoWithRetry()
  const draft = await DraftDocument.findOne({ _id: id, clerkUid: userContext.clerkUid }).lean<any>()
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

  const safeName =
    (draft.title || "document").replace(/[^\w\s.-]+/g, "").trim().slice(0, 80) || "document"

  const result = await saveBufferToVault({
    clerkUid: userContext.clerkUid,
    filename: `${safeName}.${format}`,
    mimeType: MIME[format],
    bytes: buffer,
  })

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true, alreadyInVault: result.alreadyInVault, document: result.document })
}
