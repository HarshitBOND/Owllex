import { NextRequest, NextResponse } from "next/server"
import { objectIdSchema, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import ContractReview from "@/app/api/lib/models/contract-review"
import { htmlToBlocks } from "@/app/api/lib/export/htmlBlocks"
import { renderPdf } from "@/app/api/lib/export/pdf"
import { renderDocx } from "@/app/api/lib/export/docx"

export const maxDuration = 60

const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

/**
 * Exports the reviewed contract as it stands right now -- including any edits
 * made in the editor or applied via Fix with AI -- as a properly formatted
 * document, not the plain-text issue list this route used to back.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  const format = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "docx"

  await connectMongoWithRetry()
  const review = await ContractReview.findOne({ _id: id, clerkUid: userContext.clerkUid }).lean<any>()
  if (!review) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  const blocks = htmlToBlocks(review.contentHtml || "")
  const options = {
    title: review.fileName || "Contract",
    fontFamily: review.typography?.fontFamily || "Georgia",
    fontSizePt: review.typography?.fontSizePt || 12,
  }

  const buffer = format === "docx" ? await renderDocx(blocks, options) : await renderPdf(blocks, options)

  const safeName =
    (review.fileName || "contract-review").replace(/\.[^./]+$/, "").replace(/[^\w\s.-]+/g, "").trim().slice(0, 80) ||
    "contract-review"

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": MIME[format],
      "Content-Disposition": `attachment; filename="${safeName}.${format}"`,
    },
  })
}
