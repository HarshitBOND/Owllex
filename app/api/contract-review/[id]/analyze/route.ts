import { NextRequest, NextResponse } from "next/server"
import { trimDocumentForPrompt } from "@/lib/ai/document-context"
import { generateObject } from "ai"
import { z } from "zod"
import { enforceRateLimit, objectIdSchema, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import ContractReview from "@/app/api/lib/models/contract-review"
import { modelFor } from "@/lib/ai/provider"
import { resolveModel, OUTPUT_CAPS, AI_MAX_RETRIES_TIMED } from "@/lib/ai/models"
import { cachedGenerate, hashForCache, CACHE_TTL } from "@/lib/ai/response-cache"
import { CONTRACT_REVIEW_SYSTEM_PROMPT } from "@/lib/ai/prompts"
import { checkAiAllowance, aiLimitResponse, recordAiUsage } from "@/app/api/lib/services/aiUsage"

export const maxDuration = 300

/**
 * Kept under maxDuration so a slow model is reported as a timeout rather than
 * being killed mid-flight by the platform.
 *
 * A full-length contract on the "capable" tier measures past 80s, and the route
 * used to allow 60s in total: the function was terminated before generateObject
 * returned, the browser got the platform's HTML error page instead of JSON, and
 * the page could only report it as "couldn't reach the server" -- for a backend
 * that was working, just slow. Aborting here leaves room to persist the failure
 * and answer with a real message.
 */
const ANALYSIS_TIMEOUT_MS = 240_000

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
    const documentText = trimDocumentForPrompt(review.extractedText)

    // The analysis of a fixed text never changes, and this route is entered
    // twice over for the same text as a matter of course: it fires
    // automatically on upload, and the advocate can re-run it by hand from the
    // workspace. The key is scoped to the advocate on purpose -- two people who
    // happen to upload the same contract must each get their own analysis
    // rather than one reading a result produced under the other's account.
    const { value: object, hit } = await cachedGenerate(
      `analyze:${userContext.clerkUid}:${modelKey}:${hashForCache(documentText)}`,
      CACHE_TTL.contractAnalyze,
      async () => {
        const { object, usage } = await generateObject({
          model: modelFor(modelKey),
          system: CONTRACT_REVIEW_SYSTEM_PROMPT,
          schema: analysisSchema,
          prompt: `Review this contract and return every issue you find, plus an overall summary.\n\n<document>\n${documentText}\n</document>`,
          maxOutputTokens: OUTPUT_CAPS.contractAnalyze,
          // Already bounded by its own deadline below; a retry after a timeout
          // mostly buys a second timeout at full price.
          maxRetries: AI_MAX_RETRIES_TIMED,
          abortSignal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
        })
        await recordAiUsage({ clerkUid: userContext.clerkUid, feature: "contract-analyze", modelKey, usage })
        return object
      }
    )
    if (hit) console.log("[CONTRACT_ANALYZE] served from cache, no model call")

    review.issues = object.issues.map((issue, index) => ({ id: `i${index + 1}`, ...issue }))
    review.summary = object.summary
    review.status = "ready"
    await review.save()

    return NextResponse.json({ success: true, issues: review.issues, summary: review.summary })
  } catch (error) {
    const timedOut =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
    review.status = "error"
    review.errorMessage = timedOut
      ? `The reviewer took longer than ${Math.round(ANALYSIS_TIMEOUT_MS / 1000)}s on this document. ` +
        "Try the Fast model, or split a very long contract into sections."
      : error instanceof Error
        ? error.message
        : "Analysis failed"
    await review.save()
    return NextResponse.json(
      { success: false, error: review.errorMessage, id: String(review._id) },
      { status: timedOut ? 504 : 502 },
    )
  }
}
