import { NextRequest, NextResponse } from "next/server"
import { trimDocumentForPrompt } from "@/lib/ai/document-context"
import { generateObject } from "ai"
import { z } from "zod"
import { enforceRateLimit, objectIdSchema, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import ContractReview from "@/app/api/lib/models/contract-review"
import { modelFor } from "@/lib/ai/provider"
import { resolveModel } from "@/lib/ai/models"
import { CONTRACT_REVIEW_SYSTEM_PROMPT } from "@/lib/ai/prompts"
import { checkAiAllowance, aiLimitResponse, recordAiUsage } from "@/app/api/lib/services/aiUsage"

export const maxDuration = 60

const bodySchema = z.object({ model: z.string().optional() })

const analysisSchema = z.object({
  issues: z
    .array(
      z.object({
        severity: z.enum(["critical", "warning", "suggestion", "info"]),
        title: z.string().max(200),
        description: z.string().max(2000),
        quote: z.string().max(2000).describe("The exact clause text being flagged, verbatim from the document"),
        redline: z.string().max(2000).describe("The concrete replacement wording, or empty if none applies"),
      }),
    )
    .max(40),
  summary: z.object({
    riskLevel: z.enum(["Low", "Medium", "High"]),
    summary: z.string().max(2000),
    recommendations: z.array(z.string().max(400)).max(10),
  }),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `contract-review:analyze:${userContext.clerkUid}`,
    max: 20,
    windowMs: 10 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  const parsed = await parseAndValidateJson(request, bodySchema)
  if (!parsed.success) return parsed.response
  const { model } = parsed.data

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { success: false, error: "The AI reviewer is not configured. Set OPENAI_API_KEY." },
      { status: 503 },
    )
  }

  const gate = await checkAiAllowance(userContext.clerkUid)
  if (!gate.allowed) return aiLimitResponse(gate)
  const modelKey = resolveModel(gate.snapshot.plan, model, "balanced")

  await connectMongoWithRetry()
  const review = await ContractReview.findOne({ _id: id, clerkUid: userContext.clerkUid })
  if (!review) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }
  if (!review.extractedText.trim()) {
    return NextResponse.json({ success: false, error: "Nothing extracted from this document yet" }, { status: 400 })
  }

  review.status = "analyzing"
  await review.save()

  try {
    const { object, usage } = await generateObject({
      model: modelFor(modelKey),
      system: CONTRACT_REVIEW_SYSTEM_PROMPT,
      schema: analysisSchema,
      prompt: `Review this contract and return every issue you find, plus an overall summary.\n\n<document>\n${trimDocumentForPrompt(review.extractedText)}\n</document>`,
    })

    await recordAiUsage({ clerkUid: userContext.clerkUid, feature: "contract-analyze", modelKey, usage })

    review.issues = object.issues.map((issue, index) => ({ id: `i${index + 1}`, ...issue }))
    review.summary = object.summary
    review.status = "ready"
    await review.save()

    return NextResponse.json({ success: true, issues: review.issues, summary: review.summary })
  } catch (error) {
    review.status = "error"
    review.errorMessage = error instanceof Error ? error.message : "Analysis failed"
    await review.save()
    return NextResponse.json({ success: false, error: review.errorMessage }, { status: 502 })
  }
}
