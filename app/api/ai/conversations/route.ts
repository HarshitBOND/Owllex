import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import Conversation from "@/app/api/lib/models/conversation"

export async function GET(request: NextRequest) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  await connectMongoWithRetry()
  const rows = await Conversation.find({ clerkUid: userContext.clerkUid })
    .select("chatId title updatedAt createdAt")
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean<{ chatId: string; title: string; updatedAt: Date; createdAt: Date }[]>()

  return NextResponse.json({
    success: true,
    conversations: rows.map((r) => ({
      id: r.chatId,
      title: r.title,
      updatedAt: new Date(r.updatedAt).getTime(),
      createdAt: new Date(r.createdAt).getTime(),
    })),
  })
}

const importSchema = z.object({
  conversations: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        title: z.string().min(1).max(200),
        createdAt: z.number().optional(),
        updatedAt: z.number().optional(),
        messages: z.array(
          z.object({
            id: z.string(),
            role: z.enum(["user", "assistant", "system"]),
            text: z.string().optional(),
            parts: z.array(z.any()).optional(),
            fileNames: z.array(z.string()).optional(),
          })
        ),
      })
    )
    .max(200),
})

export async function POST(request: NextRequest) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const parsed = await parseAndValidateJson(request, importSchema)
  if (!parsed.success) return parsed.response

  await connectMongoWithRetry()
  let imported = 0

  for (const c of parsed.data.conversations) {
    const messages = c.messages.map((m) => ({
      id: m.id,
      role: m.role,
      parts: m.parts ?? [{ type: "text", text: m.text ?? "" }],
      createdAt: new Date(c.updatedAt ?? Date.now()),
    }))

    const res = await Conversation.updateOne(
      { clerkUid: userContext.clerkUid, chatId: c.id },
      {
        $setOnInsert: {
          clerkUid: userContext.clerkUid,
          chatId: c.id,
          title: c.title,
          messages,
          createdAt: new Date(c.createdAt ?? Date.now()),
          updatedAt: new Date(c.updatedAt ?? Date.now()),
        },
      },
      { upsert: true }
    )
    if (res.upsertedCount) imported++
  }

  return NextResponse.json({ success: true, imported })
}
