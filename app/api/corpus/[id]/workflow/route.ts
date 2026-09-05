import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { enforceRateLimit, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import Corpus from "@/app/api/lib/models/corpus"
import CorpusWorkflow from "@/app/api/lib/models/corpus-workflow"

/**
 * The saved workflow for one matter. Scoped to the caller's own corpus, like
 * every other route in this folder.
 */

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id: corpusId } = await params

  await connectMongoWithRetry()
  if (!(await Corpus.exists({ clerkUid: userContext.clerkUid, corpusId }))) {
    return NextResponse.json({ success: false, error: "Corpus not found" }, { status: 404 })
  }

  const saved = await CorpusWorkflow.findOne({ clerkUid: userContext.clerkUid, corpusId }).lean<any>()

  return NextResponse.json({
    success: true,
    // Null rather than an empty graph: the canvas falls back to its starter
    // chain when nothing has been saved, and cannot tell the two apart
    // otherwise.
    workflow: saved
      ? {
          title: saved.title,
          nodes: saved.nodes ?? [],
          connections: saved.connections ?? [],
          updatedAt: saved.updatedAt,
        }
      : null,
  })
}

const writeSchema = z.object({
  title: z.string().trim().max(120).optional(),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        type: z.enum(["trigger", "action", "condition"]),
        title: z.string().max(200).default(""),
        description: z.string().max(500).default(""),
        icon: z.string().max(80).default(""),
        color: z.string().max(40).default(""),
      })
    )
    .max(60),
  connections: z
    .array(z.object({ from: z.string().min(1).max(80), to: z.string().min(1).max(80) }))
    .max(120),
})

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `corpus:workflow:write:${userContext.clerkUid}`,
    max: 120,
    windowMs: 10 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  const parsed = await parseAndValidateJson(request, writeSchema)
  if (!parsed.success) return parsed.response

  const { id: corpusId } = await params

  await connectMongoWithRetry()
  if (!(await Corpus.exists({ clerkUid: userContext.clerkUid, corpusId }))) {
    return NextResponse.json({ success: false, error: "Corpus not found" }, { status: 404 })
  }

  await CorpusWorkflow.findOneAndUpdate(
    { clerkUid: userContext.clerkUid, corpusId },
    {
      $set: {
        nodes: parsed.data.nodes,
        connections: parsed.data.connections,
        ...(parsed.data.title ? { title: parsed.data.title } : {}),
      },
      $setOnInsert: { clerkUid: userContext.clerkUid, corpusId },
    },
    { upsert: true }
  )

  return NextResponse.json({ success: true })
}
