import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import Conversation from "@/app/api/lib/models/conversation"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  await connectMongoWithRetry()
  const row = await Conversation.findOne({ clerkUid: userContext.clerkUid, chatId: id })
    .select("chatId title messages model updatedAt")
    .lean<{ chatId: string; title: string; messages: any[]; model?: string } | null>()

  if (!row) {
    return NextResponse.json({ success: false, error: "Conversation not found" }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    conversation: {
      id: row.chatId,
      title: row.title,
      model: row.model,
      messages: row.messages.map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts,
        ...(m.feedback ? { feedback: m.feedback } : {}),
      })),
    },
  })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  // Two edits reach a conversation: renaming it from the history panel, and
  // rating one of its answers from the answer card.
  const parsed = await parseAndValidateJson(
    request,
    z.union([
      z.object({ title: z.string().trim().min(1).max(200) }),
      z.object({
        messageId: z.string().min(1).max(128),
        feedback: z.enum(["up", "down"]).nullable(),
      }),
    ])
  )
  if (!parsed.success) return parsed.response

  const { id } = await params
  await connectMongoWithRetry()

  const res =
    "title" in parsed.data
      ? await Conversation.updateOne(
          { clerkUid: userContext.clerkUid, chatId: id },
          { $set: { title: parsed.data.title } }
        )
      : await Conversation.updateOne(
          { clerkUid: userContext.clerkUid, chatId: id },
          { $set: { "messages.$[m].feedback": parsed.data.feedback } },
          { arrayFilters: [{ "m.id": parsed.data.messageId }] }
        )

  if (!res.matchedCount) {
    return NextResponse.json({ success: false, error: "Conversation not found" }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  await connectMongoWithRetry()
  const res = await Conversation.deleteOne({ clerkUid: userContext.clerkUid, chatId: id })

  if (!res.deletedCount) {
    return NextResponse.json({ success: false, error: "Conversation not found" }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
