import { NextRequest, NextResponse } from "next/server"
import { requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import Conversation from "@/app/api/lib/models/conversation"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  await connectMongoWithRetry()
  const rows = await Conversation.find({ clerkUid: userContext.clerkUid, corpusId: id })
    .select("chatId title updatedAt createdAt")
    .sort({ updatedAt: -1 })
    .limit(100)
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
