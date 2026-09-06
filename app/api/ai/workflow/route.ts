import { NextRequest, NextResponse } from "next/server"
import { streamText, convertToModelMessages, stepCountIs, smoothStream, tool, type UIMessage } from "ai"
import { z } from "zod"
import { enforceRateLimit, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import { modelFor } from "@/lib/ai/provider"
import { resolveModel, OUTPUT_CAPS, AI_MAX_RETRIES } from "@/lib/ai/models"
import { WORKFLOW_SYSTEM_PROMPT, WORKFLOW_TOOL_RULES } from "@/lib/ai/prompts"
import { WORKFLOW_ICON_KEYS, WORKFLOW_COLOR_KEYS } from "@/lib/workflow-icon-registry"
import { checkAiAllowance, aiLimitResponse, recordAiUsage } from "@/app/api/lib/services/aiUsage"

export const maxDuration = 60

const workflowStateSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["trigger", "action", "condition"]),
      title: z.string(),
      description: z.string(),
      icon: z.string(),
      color: z.string(),
    })
  ),
  connections: z.array(z.object({ from: z.string(), to: z.string() })),
})

const bodySchema = z.object({
  id: z.string().min(1).max(64),
  model: z.string().optional(),
  workflow: workflowStateSchema.optional(),
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
    key: `ai:workflow:${userContext.clerkUid}`,
    max: 30,
    windowMs: 10 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  const parsed = await parseAndValidateJson(request, bodySchema)
  if (!parsed.success) return parsed.response

  const { model, workflow, messages } = parsed.data

  const gate = await checkAiAllowance(userContext.clerkUid)
  if (!gate.allowed) return aiLimitResponse(gate)
  const modelKey = resolveModel(gate.snapshot.plan, model, "fast")

  const currentWorkflow =
    workflow && workflow.nodes.length > 0 ? JSON.stringify(workflow, null, 2) : "(The canvas is empty.)"

  // Byte-identical on every request, so OpenAI serves it -- and the tool
  // definitions and history behind it -- from the prefix cache at a tenth of the
  // input rate. The canvas state used to be spliced in here, which changed the
  // string on every turn and so missed the cache on the entire prefix; it goes
  // out as a trailing message below instead, exactly as the chat and contract
  // chat routes already do.
  const system = `${WORKFLOW_SYSTEM_PROMPT}

${WORKFLOW_TOOL_RULES}

Allowed icon keys: ${WORKFLOW_ICON_KEYS.join(", ")}
Allowed color keys: ${WORKFLOW_COLOR_KEYS.join(", ")}`

  const result = streamText({
    model: modelFor(modelKey),
    system,
    messages: [
      ...(await convertToModelMessages(messages.slice(-40) as UIMessage[])),
      {
        role: "user" as const,
        content: `<current_workflow>\n${currentWorkflow}\n</current_workflow>`,
      },
    ],
    tools: {
      // No execute: this streams to the client and the canvas applies it once
      // rendered, same pattern as the drafting assistant's proposeDocument.
      proposeWorkflow: tool({
        description:
          "Return the complete updated workflow whenever the user asks you to build, add to, remove from, or restructure it.",
        inputSchema: z.object({
          nodes: z
            .array(
              z.object({
                id: z.string().min(1).max(40),
                type: z.enum(["trigger", "action", "condition"]),
                title: z.string().min(1).max(40),
                description: z.string().min(1).max(80),
                icon: z.enum(WORKFLOW_ICON_KEYS),
                color: z.enum(WORKFLOW_COLOR_KEYS),
              })
            )
            .min(1)
            .max(12),
          connections: z.array(z.object({ from: z.string(), to: z.string() })).max(20),
          summary: z.string().max(200).describe("One or two sentences on what the workflow now does."),
          suggestions: z
            .array(z.string().max(60))
            .max(3)
            .describe("Up to 3 short follow-up edits the user might want next."),
        }),
      }),
    },
    stopWhen: stepCountIs(3),
    maxOutputTokens: OUTPUT_CAPS.workflow,
    maxRetries: AI_MAX_RETRIES,
    experimental_transform: smoothStream({ chunking: "word" }),
    onFinish: async ({ totalUsage }) => {
      await recordAiUsage({ clerkUid: userContext.clerkUid, feature: "workflow", modelKey, usage: totalUsage })
    },
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages as UIMessage[],
  })
}
