import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { enforceRateLimit, objectIdSchema, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DraftDocument from "@/app/api/lib/models/draft-document"
import User from "@/app/api/lib/models/user"
import { htmlToBlocks } from "@/app/api/lib/export/htmlBlocks"
import { renderPdf } from "@/app/api/lib/export/pdf"
import { sendMail } from "@/app/api/lib/services/mailer"

export const maxDuration = 60

const bodySchema = z.object({
  to: z.string().trim().email().max(200),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(4000),
})

/**
 * Sends a draft to someone, as a PDF attachment.
 *
 * Rate-limited harder than the export and vault routes next door: those produce
 * a file the advocate then decides what to do with, whereas every call here
 * puts mail in someone else's inbox, and there is no recalling it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `draft-documents:email:${userContext.clerkUid}`,
    max: 10,
    windowMs: 60 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  const parsed = await parseAndValidateJson(request, bodySchema)
  if (!parsed.success) return parsed.response

  const { id } = await params
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  await connectMongoWithRetry()
  const draft = await DraftDocument.findOne({ _id: id, clerkUid: userContext.clerkUid }).lean<any>()
  if (!draft) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  if (!(draft.contentHtml || "").trim()) {
    return NextResponse.json(
      { success: false, error: "There is nothing in this document to send yet." },
      { status: 400 }
    )
  }

  const title = draft.title || "Document"
  const pdf = await renderPdf(htmlToBlocks(draft.contentHtml || ""), {
    title,
    fontFamily: draft.typography?.fontFamily || "Georgia",
    fontSizePt: draft.typography?.fontSizePt || 12,
  })

  // The mail goes out from the product's own verified sender, so without a
  // reply-to the recipient's answer would never reach the advocate who sent it.
  const sender = await User.findOne({ clerkUid: userContext.clerkUid }).select("email").lean<any>()

  const filename = `${title.replace(/[^\w\s-]+/g, "").trim().slice(0, 60) || "document"}.pdf`

  try {
    await sendMail({
      to: parsed.data.to,
      subject: parsed.data.subject,
      text: parsed.data.message,
      replyTo: sender?.email || undefined,
      attachments: [{ filename, content: pdf, type: "application/pdf" }],
    })
  } catch (error) {
    console.error("[DRAFT EMAIL] send failed:", error)
    const message = error instanceof Error ? error.message : "The email could not be sent."
    return NextResponse.json({ success: false, error: message }, { status: 502 })
  }

  return NextResponse.json({ success: true, to: parsed.data.to, filename })
}
