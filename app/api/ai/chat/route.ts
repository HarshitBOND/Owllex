import { NextRequest, NextResponse } from "next/server"
import { streamText, convertToModelMessages, stepCountIs, smoothStream, type UIMessage } from "ai"
import { z } from "zod"
import { enforceRateLimit, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import Conversation from "@/app/api/lib/models/conversation"
import Corpus from "@/app/api/lib/models/corpus"
import CorpusDocument from "@/app/api/lib/models/corpus-document"
import Case from "@/app/api/lib/models/case"
import Client from "@/app/api/lib/models/client"
import { modelFor } from "@/lib/ai/provider"
import { CHAT_SYSTEM_PROMPT, corpusContextBlock } from "@/lib/ai/prompts"
import { CASE_FIELDS, CLIENT_FIELDS } from "@/lib/ai/corpus-match"
import { legalTools } from "@/lib/ai/tools"

export const maxDuration = 60

const bodySchema = z.object({
  id: z.string().min(1).max(64),
  model: z.string().optional(),
  corpusId: z.string().max(64).nullish(),
  messages: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(["user", "assistant", "system"]),
        parts: z.array(z.any()),
      })
    )
    .min(1)
    .max(200),
})

const textOf = (m: { parts: any[] }) =>
  m.parts.filter((p) => p?.type === "text").map((p) => p.text).join(" ").trim()

export async function POST(request: NextRequest) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { success: false, error: "The AI assistant is not configured. Set OPENAI_API_KEY." },
      { status: 503 }
    )
  }

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `ai:chat:${userContext.clerkUid}`,
    max: 30,
    windowMs: 10 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  const parsed = await parseAndValidateJson(request, bodySchema)
  if (!parsed.success) return parsed.response

  const { id: chatId, model, messages, corpusId } = parsed.data

  let system = CHAT_SYSTEM_PROMPT
  let activeCorpusId: string | null = null

  if (corpusId) {
    await connectMongoWithRetry()
    const corpus = await Corpus.findOne({ clerkUid: userContext.clerkUid, corpusId }).lean<any>()
    if (corpus) {
      activeCorpusId = corpusId
      const cases = await Case.find({ _id: { $in: corpus.caseIds ?? [] } }).select(CASE_FIELDS).lean()
      const clients = await Client.find({ _id: { $in: corpus.clientIds ?? [] } }).select(CLIENT_FIELDS).lean()
      const documentCount = await CorpusDocument.countDocuments({
        clerkUid: userContext.clerkUid,
        corpusId,
        status: "ready",
      })
      system = `${CHAT_SYSTEM_PROMPT}

${corpusContextBlock({
        name: corpus.name,
        description: corpus.description,
        instructions: corpus.instructions,
        cases,
        clients,
        documentCount,
      })}`
    }
  }

  const result = streamText({
    model: modelFor(model),
    system,
    messages: await convertToModelMessages(messages as UIMessage[]),
    tools: legalTools(userContext.clerkUid, activeCorpusId),
    stopWhen: stepCountIs(6),
    experimental_transform: smoothStream({ chunking: "word" }),
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages as UIMessage[],
    onEnd: async ({ messages: finalMessages, isAborted }) => {
      if (isAborted) return
      const firstUser = finalMessages.find((m) => m.role === "user")
      const title = (firstUser ? textOf(firstUser) : "").slice(0, 60) || "New conversation"

      await connectMongoWithRetry()
      await Conversation.findOneAndUpdate(
        { clerkUid: userContext.clerkUid, chatId },
        {
          $set: { messages: finalMessages, model, updatedAt: new Date() },
          $setOnInsert: { clerkUid: userContext.clerkUid, chatId, title, corpusId: activeCorpusId },
        },
        { upsert: true }
      )
    },
  })
}
