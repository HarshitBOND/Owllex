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
import { trimDocumentForPrompt } from "@/lib/ai/document-context"
import { messagesForStorage, stripEphemeralParts, MAX_STORED_MESSAGES } from "@/lib/ai/message-trim"

export const maxDuration = 60

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
  const safeDocument = trimDocumentForPrompt(sanitizeDocumentHtml(documentHtml))

  // The system prompt is kept byte-identical across every request. The document
  // used to live in here, and because it changes on each turn it invalidated the
  // cached prefix -- system, tool definitions and the whole history behind it --
  // on every single call. Sending it as the last message instead means
  // everything before it caches at a tenth of the input rate, and only the
  // document itself is charged in full.
  const system = `${DRAFTING_SYSTEM_PROMPT}\n\n${DRAFT_TOOL_RULES}`

  const history = await convertToModelMessages(
    stripEphemeralParts(messages.slice(-MAX_STORED_MESSAGES) as UIMessage[])
  )
  const documentMessage = {
    role: "user" as const,
    content: `<current_document>\n${safeDocument || "(The document is empty.)"}\n</current_document>`,
  }

  const result = streamText({
    model: modelFor(modelKey),
    system,
    messages: [...history, documentMessage],
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
            .describe("One line describing what changed, e.g. 'Added clause 6 interest on delayed refund'."),
        }),
      }),
      // No execute here either: the questions render to the advocate, who answers
      // in their next message rather than resolving a tool result.
      askClarification: tool({
        description:
          "Ask the advocate for facts you need before you can draft a document that's actually usable, instead of guessing them. Use this only when a missing fact would make the draft wrong — who the parties are, what the document covers, a specific date or amount — never for a stylistic or boilerplate choice you can reasonably default.",
        inputSchema: z.object({
          questions: z
            .array(z.string().min(1).max(200))
            .min(1)
            .max(4)
            .describe("Short, specific questions, one per missing fact."),
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
      // Chat history only the editor owns contentHtml through autosave.
      await DraftDocument.updateOne(
        { _id: draftId, clerkUid: userContext.clerkUid },
        { $set: { chatMessages: messagesForStorage(finalMessages) } }
      )
    },
  })
}
