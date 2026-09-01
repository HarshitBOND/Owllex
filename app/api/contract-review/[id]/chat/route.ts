import { NextRequest, NextResponse } from "next/server"
import { streamText, convertToModelMessages, stepCountIs, smoothStream, tool, type UIMessage } from "ai"
import { z } from "zod"
import { enforceRateLimit, objectIdSchema, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import ContractReview from "@/app/api/lib/models/contract-review"
import { sanitizeDocumentHtml } from "@/app/api/lib/html/sanitizeHtml"
import { modelFor } from "@/lib/ai/provider"
import { resolveModel } from "@/lib/ai/models"
import { CONTRACT_REVIEW_SYSTEM_PROMPT, CONTRACT_CHAT_TOOL_RULES } from "@/lib/ai/prompts"
import { checkAiAllowance, aiLimitResponse, recordAiUsage } from "@/app/api/lib/services/aiUsage"

export const maxDuration = 60

const MAX_CONTEXT_CHARS = 60000

const bodySchema = z.object({
  model: z.string().optional(),
  documentHtml: z.string().max(400000).default(""),
  messages: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(["user", "assistant", "system"]),
        parts: z.array(z.any()),
      }),
    )
    .min(1)
    .max(200),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { success: false, error: "The AI assistant is not configured. Set OPENAI_API_KEY." },
      { status: 503 },
    )
  }

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `contract-review:chat:${userContext.clerkUid}`,
    max: 30,
    windowMs: 10 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  const parsed = await parseAndValidateJson(request, bodySchema)
  if (!parsed.success) return parsed.response
  const { model, documentHtml, messages } = parsed.data

  const gate = await checkAiAllowance(userContext.clerkUid)
  if (!gate.allowed) return aiLimitResponse(gate)
  const modelKey = resolveModel(gate.snapshot.plan, model, "balanced")

  await connectMongoWithRetry()
  const review = await ContractReview.findOne({ _id: id, clerkUid: userContext.clerkUid })
  if (!review) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  const safeDocument = sanitizeDocumentHtml(documentHtml).slice(-MAX_CONTEXT_CHARS)
  const issuesBlock = review.issues.length
    ? review.issues
        .map((i) => `- [${i.severity}] ${i.title}: ${i.description}${i.quote ? ` (quoting: "${i.quote}")` : ""}`)
        .join("\n")
    : "(no issues on file — run a review first if you want a starting list)"

  const system = [
    CONTRACT_REVIEW_SYSTEM_PROMPT,
    CONTRACT_CHAT_TOOL_RULES,
    `<current_document>\n${safeDocument || "(The document is empty.)"}\n</current_document>`,
    `<flagged_issues>\n${issuesBlock}\n</flagged_issues>`,
  ].join("\n\n")

  const result = streamText({
    model: modelFor(modelKey),
    system,
    messages: await convertToModelMessages(messages.slice(-40) as UIMessage[]),
    tools: {
      proposeFix: tool({
        description:
          "Return the complete updated document whenever the user asks you to fix, redline, add, remove or change anything in it. Always return the ENTIRE document, preserving verbatim every section you were not asked to change.",
        inputSchema: z.object({
          html: z
            .string()
            .min(1)
            .describe("The complete document as clean semantic HTML. No markdown fences, no inline styles."),
          summary: z
            .string()
            .max(200)
            .describe("One line describing what changed, e.g. 'Shortened payment terms from 60 to 30 days.'"),
        }),
      }),
    },
    stopWhen: stepCountIs(3),
    experimental_transform: smoothStream({ chunking: "word" }),
    onFinish: async ({ totalUsage }) => {
      await recordAiUsage({ clerkUid: userContext.clerkUid, feature: "contract-chat", modelKey, usage: totalUsage })
    },
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages as UIMessage[],
    onEnd: async ({ messages: finalMessages, isAborted }) => {
      if (isAborted) return
      await connectMongoWithRetry()
      await ContractReview.updateOne(
        { _id: id, clerkUid: userContext.clerkUid },
        { $set: { chatMessages: finalMessages } },
      )
    },
  })
}
