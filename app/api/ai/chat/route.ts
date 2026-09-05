import { NextRequest, NextResponse } from "next/server"
import {
  streamText,
  generateObject,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  smoothStream,
  type UIMessage,
} from "ai"
import { z } from "zod"
import { enforceRateLimit, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import Conversation from "@/app/api/lib/models/conversation"
import Corpus from "@/app/api/lib/models/corpus"
import CorpusDocument from "@/app/api/lib/models/corpus-document"
import Case from "@/app/api/lib/models/case"
import Client from "@/app/api/lib/models/client"
import { modelFor } from "@/lib/ai/provider"
import { MODELS, resolveModel } from "@/lib/ai/models"
import { ANSWER_LENGTH_RULES, CHAT_SYSTEM_PROMPT, corpusContextBlock } from "@/lib/ai/prompts"
import { CASE_FIELDS, CLIENT_FIELDS } from "@/lib/ai/corpus-match"
import { legalTools } from "@/lib/ai/tools"
import { ACTION_TOOL } from "@/lib/ai/actions"
import { createSourceRegistry } from "@/lib/ai/sources"
import { ANSWER_META_PROMPT } from "@/lib/ai/prompts"
import {
  messagesForStorage,
  settleDanglingToolCalls,
  stripEphemeralParts,
  MAX_STORED_MESSAGES,
} from "@/lib/ai/message-trim"
import { checkAiAllowance, aiLimitResponse, recordAiUsage } from "@/app/api/lib/services/aiUsage"

// The answer itself gets 60s; the title-and-follow-ups epilogue runs after it.
export const maxDuration = 90

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

  const gate = await checkAiAllowance(userContext.clerkUid)
  if (!gate.allowed) return aiLimitResponse(gate)
  const modelKey = resolveModel(gate.snapshot.plan, model, "fast")

  // Byte-identical on every request from every user, so OpenAI can serve it
  // (and the tool definitions and history behind it) from the prefix cache at a
  // tenth of the input rate. Per-corpus context is appended to the message
  // stream below rather than spliced in here, which is what used to make this
  // string different on each call.
  const system = CHAT_SYSTEM_PROMPT
  let corpusContext: string | null = null
  let activeCorpusId: string | null = null

  if (corpusId) {
    await connectMongoWithRetry()
    const corpus = await Corpus.findOne({ clerkUid: userContext.clerkUid, corpusId }).lean<any>()
    if (corpus) {
      activeCorpusId = corpusId
      const cases = await Case.find({ _id: { $in: corpus.caseIds ?? [] } }).select(CASE_FIELDS).limit(25).lean()
      const clients = await Client.find({ _id: { $in: corpus.clientIds ?? [] } }).select(CLIENT_FIELDS).limit(25).lean()
      const documentCount = await CorpusDocument.countDocuments({
        clerkUid: userContext.clerkUid,
        corpusId,
        status: "ready",
      })
      corpusContext = `${corpusContextBlock({
        name: corpus.name,
        description: corpus.description,
        instructions: corpus.instructions,
        cases,
        clients,
        documentCount,
      })}`
    }
  }

  const modelMessages = [
    // settleDanglingToolCalls before conversion: askClarifyingQuestion has no
    // execute, so a question the advocate answered by typing instead of
    // clicking would otherwise reach convertToModelMessages as a call with no
    // result, and take the whole conversation down with AI_MissingToolResultsError.
    ...(await convertToModelMessages(
      settleDanglingToolCalls(stripEphemeralParts(messages.slice(-MAX_STORED_MESSAGES) as UIMessage[]))
    )),
    ...(corpusContext ? [{ role: "user" as const, content: corpusContext }] : []),
    { role: "user" as const, content: ANSWER_LENGTH_RULES[modelKey] },
  ]

  const stream = createUIMessageStream<UIMessage>({
    originalMessages: messages as UIMessage[],
    execute: async ({ writer }) => {
      // One registry per request: it hands the retrieval tools the numbers the
      // model cites with, and the same numbers reach the UI as `data-sources`.
      const registry = createSourceRegistry()

      const result = streamText({
        model: modelFor(modelKey),
        system,
        messages: modelMessages,
        tools: legalTools(userContext.clerkUid, activeCorpusId, { registry, writer }),
        stopWhen: stepCountIs(MODELS[modelKey].maxSteps),
        maxOutputTokens: MODELS[modelKey].maxOutputTokens,
        experimental_transform: smoothStream({ chunking: "word" }),
        providerOptions: {
          openai: { reasoningSummary: "auto" },
        },
        onFinish: async ({ totalUsage }) => {
          await recordAiUsage({ clerkUid: userContext.clerkUid, feature: "chat", modelKey, usage: totalUsage })
        },
      })

      // sendFinish: false so the epilogue below still has an open stream to
      // write into; createUIMessageStream emits the finish chunk when execute
      // resolves.
      writer.merge(result.toUIMessageStream({ sendFinish: false }))

      const answer = await result.text
      if (!answer.trim()) return

      // A turn that ends by putting something to the advocate -- a question, or
      // an action to approve -- is not an answer yet: titling it and generating
      // follow-ups would describe a turn that is about to be closed, and the
      // real answer gets its own metadata anyway.
      const pending = (await result.toolCalls).some(
        (call) => call?.toolName === "askClarifyingQuestion" || call?.toolName === ACTION_TOOL
      )
      if (pending) return

      // A title and follow-ups for the answer card. Best-effort: losing them
      // must never cost the advocate the answer they are already reading.
      try {
        const lastUser = [...messages].reverse().find((m) => m.role === "user")
        const meta = await generateObject({
          model: modelFor("fast"),
          schema: z.object({
            title: z.string().max(70).describe("A short noun-phrase title for this answer, no trailing full stop"),
            followUps: z
              .array(z.string().max(160))
              .max(4)
              .describe("Questions the advocate would realistically ask next about this same matter"),
          }),
          system: ANSWER_META_PROMPT,
          prompt: `Question:\n${lastUser ? textOf(lastUser) : ""}\n\nAnswer:\n${answer.slice(0, 6000)}`,
        })
        await recordAiUsage({ clerkUid: userContext.clerkUid, feature: "chat", modelKey: "fast", usage: meta.usage })
        writer.write({ type: "data-answer-meta", id: "meta", data: meta.object })
      } catch (error) {
        console.error("[CHAT] answer metadata failed:", error)
      }
    },
    onEnd: async ({ messages: finalMessages, isAborted }) => {
      if (isAborted) return
      const firstUser = finalMessages.find((m) => m.role === "user")
      const title = (firstUser ? textOf(firstUser) : "").slice(0, 60) || "New conversation"

      await connectMongoWithRetry()
      await Conversation.findOneAndUpdate(
        { clerkUid: userContext.clerkUid, chatId },
        {
          $set: {
            messages: await withPreservedFeedback(userContext.clerkUid, chatId, messagesForStorage(finalMessages)),
            model,
            updatedAt: new Date(),
            // Written on every turn, not just at insert: a corpus is very often
            // created part-way through the conversation that established the
            // matter (proposeAction -> saveToCorpus), and a thread that adopted
            // one that way would otherwise never link to it -- leaving the
            // matter's own conversation missing from /corpus/[id].
            ...(activeCorpusId ? { corpusId: activeCorpusId } : {}),
          },
          // Only seeds corpusId when there is none to set above; the same field
          // cannot appear in both operators.
          $setOnInsert: {
            clerkUid: userContext.clerkUid,
            chatId,
            title,
            ...(activeCorpusId ? {} : { corpusId: null }),
          },
        },
        { upsert: true }
      )
    },
    onError: (error) => {
      console.error("[CHAT] stream failed:", error)
      return "The assistant couldn't respond. Please try again."
    },
  })

  return createUIMessageStreamResponse({ stream })
}

/**
 * The turn is written back with `$set`, which would otherwise erase a thumbs
 * up/down the advocate left on an earlier answer in the same thread. Ratings
 * live on the stored message, not on the UI message the model stream produces,
 * so they have to be carried across by hand.
 */
async function withPreservedFeedback(clerkUid: string, chatId: string, next: UIMessage[]) {
  const existing = await Conversation.findOne({ clerkUid, chatId }).select("messages").lean<any>()
  if (!existing?.messages?.length) return next

  const ratings = new Map<string, string>()
  for (const message of existing.messages) {
    if (message?.id && message.feedback) ratings.set(message.id, message.feedback)
  }
  if (!ratings.size) return next

  return next.map((message) =>
    ratings.has(message.id) ? { ...message, feedback: ratings.get(message.id) } : message
  )
}
