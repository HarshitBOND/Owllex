import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { enforceRateLimit, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import Corpus from "@/app/api/lib/models/corpus"
import CorpusDocument from "@/app/api/lib/models/corpus-document"
import Conversation from "@/app/api/lib/models/conversation"

const ACCENTS = ["teal", "indigo", "amber", "violet", "rose", "emerald"]

export async function GET(request: NextRequest) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  await connectMongoWithRetry()
  const rows = await Corpus.find({ clerkUid: userContext.clerkUid })
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean<any[]>()

  const ids = rows.map((r) => r.corpusId)
  const docCounts = await CorpusDocument.aggregate([
    { $match: { clerkUid: userContext.clerkUid, corpusId: { $in: ids } } },
    { $group: { _id: "$corpusId", count: { $sum: 1 } } },
  ])
  const chatCounts = await Conversation.aggregate([
    { $match: { clerkUid: userContext.clerkUid, corpusId: { $in: ids } } },
    { $group: { _id: "$corpusId", count: { $sum: 1 } } },
  ])
  const docMap = new Map(docCounts.map((d) => [d._id, d.count]))
  const chatMap = new Map(chatCounts.map((d) => [d._id, d.count]))

  return NextResponse.json({
    success: true,
    corpora: rows.map((r) => ({
      id: r.corpusId,
      name: r.name,
      description: r.description,
      accent: r.accent,
      archived: r.archived,
      caseCount: r.caseIds?.length ?? 0,
      // Exposed so picking a case can link the corpus that already covers it,
      // rather than making the advocate find and choose it a second time.
      caseIds: (r.caseIds ?? []).map((id: unknown) => String(id)),
      clientCount: r.clientIds?.length ?? 0,
      documentCount: docMap.get(r.corpusId) ?? 0,
      chatCount: chatMap.get(r.corpusId) ?? 0,
      updatedAt: new Date(r.updatedAt).getTime(),
      createdAt: new Date(r.createdAt).getTime(),
    })),
  })
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(4000).default(""),
  instructions: z.string().max(4000).default(""),
  caseIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(100).default([]),
  clientIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(100).default([]),
})

export async function POST(request: NextRequest) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `corpus:create:${userContext.clerkUid}`,
    max: 30,
    windowMs: 10 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  const parsed = await parseAndValidateJson(request, createSchema)
  if (!parsed.success) return parsed.response

  await connectMongoWithRetry()
  const created = await Corpus.create({
    clerkUid: userContext.clerkUid,
    corpusId: randomUUID().replace(/-/g, ""),
    name: parsed.data.name,
    description: parsed.data.description,
    instructions: parsed.data.instructions,
    caseIds: parsed.data.caseIds,
    clientIds: parsed.data.clientIds,
    accent: ACCENTS[Math.floor(Math.random() * ACCENTS.length)],
  })

  return NextResponse.json({
    success: true,
    corpus: { id: created.corpusId, name: created.name },
  })
}
