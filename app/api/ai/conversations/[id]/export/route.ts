import { NextRequest, NextResponse } from "next/server"
import { requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import Conversation from "@/app/api/lib/models/conversation"
import { markdownToBlocks } from "@/lib/markdown/markdownToBlocks"
import { renderPdf } from "@/app/api/lib/export/pdf"
import { renderDocx } from "@/app/api/lib/export/docx"
import type { ChatSource } from "@/lib/ai/sources"

export const maxDuration = 60

const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

/**
 * Exports one assistant answer as a document. The [n] markers are kept and the
 * sources they point at are appended, so the citations still resolve once the
 * answer has left the app -- which is the whole reason to export it.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  const url = new URL(request.url)
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "docx"
  const messageId = url.searchParams.get("messageId")

  if (!messageId) {
    return NextResponse.json({ success: false, error: "messageId is required" }, { status: 400 })
  }

  try {
    await connectMongoWithRetry()
    const conversation = await Conversation.findOne({ clerkUid: userContext.clerkUid, chatId: id })
      .select("title messages")
      .lean<any>()
    if (!conversation) {
      return NextResponse.json({ success: false, error: "Conversation not found" }, { status: 404 })
    }

    const message = conversation.messages?.find((m: any) => m.id === messageId && m.role === "assistant")
    if (!message) {
      return NextResponse.json({ success: false, error: "Message not found" }, { status: 404 })
    }

    const parts: any[] = Array.isArray(message.parts) ? message.parts : []
    const answer = parts
      .filter((p) => p?.type === "text")
      .map((p) => p.text)
      .join("")
    if (!answer.trim()) {
      return NextResponse.json({ success: false, error: "Nothing to export" }, { status: 400 })
    }

    const sources: ChatSource[] = parts.find((p) => p?.type === "data-sources")?.data?.sources ?? []
    const title = parts.find((p) => p?.type === "data-answer-meta")?.data?.title || conversation.title || "Answer"

    const dateLine = new Date(message.createdAt ?? Date.now())
      .toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
      .replace(/\//g, "-")

    // A PDF whose only title lives in invisible document metadata reads as a
    // raw dump, not a document. Render it on the page instead, as a LaTeX
    // \maketitle would: title, byline, rule, then the body -- and let the
    // existing "h1 -> centered, larger" heading logic in pdf.ts/docx.ts do the
    // rest. Only the byline needs raw HTML (for centering); it's a string we
    // built ourselves, not user input, so no escaping is needed.
    const masthead = `# ${title}\n\n<p style="text-align:center"><em>Ravenslaw · ${dateLine}</em></p>\n\n---\n\n`

    const body = sources.length
      ? `${answer}\n\n## Sources\n\n${sources
          .map((s) => `${s.n}. ${s.title}${s.url ? ` — ${absolute(s.url, url.origin)}` : ""}`)
          .join("\n")}`
      : answer

    const blocks = markdownToBlocks(`${masthead}${body}`)
    const options = { title, fontFamily: "Georgia", fontSizePt: 11 }
    const buffer = format === "docx" ? await renderDocx(blocks, options) : await renderPdf(blocks, options)

    const safeName =
      title.replace(/\.[^./]+$/, "").replace(/[^\w\s.-]+/g, "").trim().slice(0, 80) || "answer"

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": MIME[format],
        "Content-Disposition": `attachment; filename="${safeName}.${format}"`,
      },
    })
  } catch (error) {
    console.error("[EXPORT] answer export failed:", error)
    return NextResponse.json({ success: false, error: "Export failed" }, { status: 500 })
  }
}

// Viewer links are app-relative and expire; still, a reader outside the app is
// better served by a full URL than by "/api/documents/view?token=...".
const absolute = (href: string, origin: string) => (href.startsWith("/") ? `${origin}${href}` : href)
