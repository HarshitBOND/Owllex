import { NextRequest, NextResponse } from "next/server"
import { streamText, convertToModelMessages, stepCountIs, smoothStream, type UIMessage } from "ai"
import { z } from "zod"
import { enforceRateLimit, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import Conversation from "@/app/api/lib/models/conversation"
import { modelFor } from "@/lib/ai/provider"
import { CHAT_SYSTEM_PROMPT } from "@/lib/ai/prompts"
import { legalTools } from "@/lib/ai/tools"

export const maxDuration = 60

const bodySchema = z.object({
  id: z.string().min(1).max(64),
  model: z.string().optional(),
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

  const { id: chatId, model, messages } = parsed.data

  const result = streamText({
    model: modelFor(model),
    system: CHAT_SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages as UIMessage[]),
    tools: legalTools(userContext.clerkUid),
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
          $setOnInsert: { clerkUid: userContext.clerkUid, chatId, title },
        },
        { upsert: true }
      )
    },
  })
}
