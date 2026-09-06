import { NextRequest, NextResponse } from "next/server"
import { createUIMessageStream, createUIMessageStreamResponse } from "ai"
import { z } from "zod"
import { enforceRateLimit, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import Corpus from "@/app/api/lib/models/corpus"
import { runDeepResearchPipeline } from "@/app/api/lib/services/deepResearch"
import {
  checkAiAllowance,
  checkAndCountResearchRun,
  aiLimitResponse,
} from "@/app/api/lib/services/aiUsage"

export const maxDuration = 300

const bodySchema = z.object({
  query: z.string().trim().min(1).max(4000),
  corpusId: z.string().max(64).nullish(),
})

export async function POST(request: NextRequest) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { success: false, error: "Deep Research is not configured. Set OPENAI_API_KEY." },
      { status: 503 }
    )
  }

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `ai:research:${userContext.clerkUid}`,
    max: 10,
    windowMs: 10 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  const parsed = await parseAndValidateJson(request, bodySchema)
  if (!parsed.success) return parsed.response
  const { query, corpusId } = parsed.data

  const gate = await checkAiAllowance(userContext.clerkUid)
  if (!gate.allowed) return aiLimitResponse(gate)

  const runGate = await checkAndCountResearchRun(userContext.clerkUid, gate.snapshot)
  if (!runGate.allowed) return aiLimitResponse(runGate)

  const clerkUid = userContext.clerkUid
  const plan = gate.snapshot.plan

  let activeCorpusId: string | null = null
  if (corpusId) {
    await connectMongoWithRetry()
    const corpus = await Corpus.findOne({ clerkUid, corpusId }).lean<any>()
    if (corpus) activeCorpusId = corpusId
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      await runDeepResearchPipeline({ writer, clerkUid, plan, corpusId: activeCorpusId, query })
    },
    onError: (error) => {
      console.error("[RESEARCH] pipeline failed:", error)
      return "Deep Research failed. Please try again."
    },
  })

  return createUIMessageStreamResponse({ stream })
}
