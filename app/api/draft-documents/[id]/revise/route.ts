import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { enforceRateLimit, objectIdSchema, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DraftDocument from "@/app/api/lib/models/draft-document"
import { resolveModel } from "@/lib/ai/models"
import { DRAFT_REVISE_SYSTEM_PROMPT } from "@/lib/ai/prompts"
import { checkAiAllowance, aiLimitResponse } from "@/app/api/lib/services/aiUsage"
import { streamRevision, type RevisableDoc } from "@/app/api/lib/services/revise"

export const maxDuration = 300

const bodySchema = z.object({
  instruction: z.string().min(1).max(2000),
  model: z.string().optional(),
  selection: z
    .object({
      from: z.number().int().min(0),
      to: z.number().int().min(0),
      text: z.string().max(8000),
    })
    .nullish(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `draft-documents:revise:${userContext.clerkUid}`,
    max: 20,
    windowMs: 10 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  const parsed = await parseAndValidateJson(request, bodySchema)
  if (!parsed.success) return parsed.response
  const { instruction, model, selection } = parsed.data

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { success: false, error: "The AI assistant is not configured. Set OPENAI_API_KEY." },
      { status: 503 },
    )
  }

  const gate = await checkAiAllowance(userContext.clerkUid)
  if (!gate.allowed) return aiLimitResponse(gate)
  const modelKey = resolveModel(gate.snapshot.plan, model, "balanced")

  await connectMongoWithRetry()
  const draft = await DraftDocument.findOne({ _id: id, clerkUid: userContext.clerkUid })
  if (!draft) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }
  if (!draft.contentHtml.trim()) {
    return NextResponse.json(
      { success: false, error: "There is nothing in this document to revise yet" },
      { status: 400 },
    )
  }

  const { result } = streamRevision({
    clerkUid: userContext.clerkUid,
    doc: draft as unknown as RevisableDoc,
    systemPrompt: DRAFT_REVISE_SYSTEM_PROMPT,
    feature: "draft-revise",
    modelKey,
    instruction,
    selection,
  })

  return result.toTextStreamResponse()
}
