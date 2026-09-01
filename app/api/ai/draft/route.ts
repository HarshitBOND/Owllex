import { NextRequest, NextResponse } from "next/server"
import { streamText, convertToModelMessages, stepCountIs, smoothStream, tool, type UIMessage } from "ai"
import { z } from "zod"
import { enforceRateLimit, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DraftDocument from "@/app/api/lib/models/draft-document"
import { sanitizeDocumentHtml } from "@/app/api/lib/html/sanitizeHtml"
import { modelFor } from "@/lib/ai/provider"
import { resolveModel } from "@/lib/ai/models"
import { DRAFTING_SYSTEM_PROMPT, DRAFT_TOOL_RULES } from "@/lib/ai/prompts"
import { checkAiAllowance, aiLimitResponse, recordAiUsage } from "@/app/api/lib/services/aiUsage"

export const maxDuration = 60

const MAX_CONTEXT_CHARS = 60000

const bodySchema = z.object({
  id: z.string().min(1).max(64),
  model: z.string().optional(),
  documentHtml: z.string().max(200000).default(""),
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
    key: `ai:draft:${userContext.clerkUid}`,
    max: 30,
    windowMs: 10 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  const parsed = await parseAndValidateJson(request, bodySchema)
  if (!parsed.success) return parsed.response

  const { id: draftId, model, documentHtml, messages } = parsed.data

  const gate = await checkAiAllowance(userContext.clerkUid)
  if (!gate.allowed) return aiLimitResponse(gate)
  const modelKey = resolveModel(gate.snapshot.plan, model, "balanced")

  // Sanitized before it reaches the model, so a poisoned document body cannot
  // smuggle markup or handlers into the prompt.
  const safeDocument = sanitizeDocumentHtml(documentHtml).slice(-MAX_CONTEXT_CHARS)

  const system = safeDocument
    ? `${DRAFTING_SYSTEM_PROMPT}\n\n${DRAFT_TOOL_RULES}\n\n<current_document>\n${safeDocument}\n</current_document>`
    : `${DRAFTING_SYSTEM_PROMPT}\n\n${DRAFT_TOOL_RULES}\n\n<current_document>\n(The document is empty.)\n</current_document>`

  const result = streamText({
    model: modelFor(modelKey),
    system,
    messages: await convertToModelMessages(messages.slice(-40) as UIMessage[]),
    tools: {
      // No execute: this streams to the client and waits for the advocate to
      // accept or discard the redline before anything touches the editor.
      proposeDocument: tool({
        description:
          "Return the complete updated document whenever the user asks you to write, add, remove or change anything in it. Always return the ENTIRE document, preserving verbatim every section you were not asked to change.",
        inputSchema: z.object({
          html: z
            .string()
            .min(1)
            .describe("The complete document as clean semantic HTML. No markdown fences, no inline styles."),
          summary: z
            .string()
            .max(200)
            .describe("One line describing what changed, e.g. 'Added clause 6 — interest on delayed refund'."),
        }),
      }),
    },
    stopWhen: stepCountIs(3),
    experimental_transform: smoothStream({ chunking: "word" }),
    onFinish: async ({ totalUsage }) => {
      await recordAiUsage({ clerkUid: userContext.clerkUid, feature: "draft", modelKey, usage: totalUsage })
    },
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages as UIMessage[],
    onEnd: async ({ messages: finalMessages, isAborted }) => {
      if (isAborted) return
      await connectMongoWithRetry()
      // Chat history only — the editor owns contentHtml through autosave.
      await DraftDocument.updateOne(
        { _id: draftId, clerkUid: userContext.clerkUid },
        { $set: { chatMessages: finalMessages } }
      )
    },
  })
}
