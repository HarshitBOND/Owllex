import { NextRequest, NextResponse } from "next/server"
import { generateObject } from "ai"
import { z } from "zod"
import { enforceRateLimit, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import { findCases, findClients } from "@/lib/ai/corpus-match"
import { modelFor } from "@/lib/ai/provider"
import { checkAiAllowance, aiLimitResponse, recordAiUsage } from "@/app/api/lib/services/aiUsage"

const bodySchema = z.object({
  description: z.string().trim().min(1).max(4000),
})

export async function POST(request: NextRequest) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `corpus:preview:${userContext.clerkUid}`,
    max: 30,
    windowMs: 10 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  const parsed = await parseAndValidateJson(request, bodySchema)
  if (!parsed.success) return parsed.response

  const { description } = parsed.data

  const gate = await checkAiAllowance(userContext.clerkUid)
  if (!gate.allowed) return aiLimitResponse(gate)

  const cases = await findCases(userContext.clerkUid, description, 40)
  const clients = await findClients(userContext.clerkUid, description, 40)

  let name = ""
  let instructions = ""
  let keepCases = new Set(cases.map((c: any) => String(c._id)))
  let keepClients = new Set(clients.map((c: any) => String(c._id)))

  if (process.env.OPENAI_API_KEY) {
    try {
      const { object, usage } = await generateObject({
        model: modelFor("fast"),
        schema: z.object({
          name: z.string().max(120),
          instructions: z.string().max(1200),
          caseIds: z.array(z.string()),
          clientIds: z.array(z.string()),
        }),
        prompt: [
          "An advocate is creating a workspace (a 'corpus') for one matter. This is how they described it:",
          description,
          "",
          "Their own case files:",
          JSON.stringify(
            cases.map((c: any) => ({
              id: String(c._id),
              caseNo: c.caseNo,
              title: c.caseTitle,
              court: c.courtName,
              stage: c.caseStage,
            }))
          ),
          "",
          "Their own clients:",
          JSON.stringify(
            clients.map((c: any) => ({ id: String(c._id), name: c.name, company: c.company }))
          ),
          "",
          "Return a short name for this corpus (a matter name, not a sentence); standing instructions",
          "telling an assistant what this matter is about and how to help on it; and the ids of only the",
          "cases and clients that genuinely belong to this matter. Return empty arrays if none belong.",
          "Use only ids that appear above.",
        ].join("\n"),
      })

      await recordAiUsage({ clerkUid: userContext.clerkUid, feature: "corpus-preview", modelKey: "fast", usage })

      keepCases = new Set(object.caseIds.filter((id) => keepCases.has(id)))
      keepClients = new Set(object.clientIds.filter((id) => keepClients.has(id)))
      name = object.name.trim()
      instructions = object.instructions.trim()
    } catch (error) {
      console.error("[CORPUS] auto-link failed, falling back to keyword matches:", error)
    }
  }

  if (!name) name = description.split(/[.\n]/)[0].slice(0, 80).trim() || "Untitled corpus"

  return NextResponse.json({
    success: true,
    name,
    instructions,
    matched: {
      cases: cases.map((c: any) => ({
        id: String(c._id),
        caseNo: c.caseNo,
        title: c.caseTitle,
        court: c.courtName,
        stage: c.caseStage,
        linked: keepCases.has(String(c._id)),
      })),
      clients: clients.map((c: any) => ({
        id: String(c._id),
        name: c.name,
        company: c.company,
        linked: keepClients.has(String(c._id)),
      })),
    },
  })
}
