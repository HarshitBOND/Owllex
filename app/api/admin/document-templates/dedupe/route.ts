import { NextRequest, NextResponse } from "next/server"
import { generateObject } from "ai"
import { z } from "zod"
import { requireAdmin } from "@/app/api/lib/adminMiddleware"
import { objectIdSchema, parseAndValidateJson } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DocumentTemplate from "@/app/api/lib/models/document-template"
import { modelFor } from "@/lib/ai/provider"
import { OUTPUT_CAPS, AI_MAX_RETRIES_TIMED } from "@/lib/ai/models"
import { recordAiUsage } from "@/app/api/lib/services/aiUsage"
import { diffLines, fieldKeyOverlap, plainTextOf, textSimilarity } from "@/lib/templates/similarity"
import type { TemplateField } from "@/lib/templates/fields"

/**
 * Looks for templates the newly imported one duplicates.
 *
 * Nothing here changes anything. It produces a comparison for an admin to read
 * and decide on, because a wrong match silently removes a form advocates depend
 * on and the failure is invisible until somebody needs it.
 *
 * Two stages, in that order for cost: a structural shortlist that costs nothing,
 * then one model call over only the close candidates.
 */
export const maxDuration = 60

/** Below both of these two forms are not plausibly the same document. */
const MIN_TEXT_SIMILARITY = 0.55
const MIN_FIELD_OVERLAP = 0.3

/** Only the closest few are worth a model verdict. */
const MAX_CANDIDATES = 3

const bodySchema = z.object({
  templateId: z.string().refine((v) => objectIdSchema.safeParse(v).success, "Invalid id"),
})

const verdictSchema = z.object({
  verdicts: z.array(
    z.object({
      candidateId: z.string(),
      verdict: z.enum(["duplicate", "newer-version", "different-form"]),
      confidence: z.number().min(0).max(1),
      reason: z.string().max(240).describe("One line, in plain language, saying why."),
    })
  ),
})

const DEDUPE_PROMPT = `You compare Indian court forms that have been turned into fillable templates.

For each candidate, decide how it relates to the newly imported form:

- "duplicate": the same form, with no material difference. Only formatting, spacing,
  scanning artefacts or token naming differ.
- "newer-version": recognisably the same form, but the wording, the fields or the
  statutory references have genuinely changed. A revised edition.
- "different-form": a different document, even if it belongs to the same family of
  filings or shares a lot of boilerplate.

Be conservative. Two forms that serve different procedural purposes are
"different-form" even when their headings and boilerplate are nearly identical --
an advocate filing the wrong one is a worse outcome than an admin keeping two
templates. Say what actually differs in one line; do not restate the scores.`

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (admin instanceof NextResponse) return admin

  const parsed = await parseAndValidateJson(request, bodySchema)
  if (!parsed.success) return parsed.response

  await connectMongoWithRetry()

  const imported = await DocumentTemplate.findById(parsed.data.templateId).lean()
  if (!imported) {
    return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 })
  }

  const importedFields = (imported.fields as TemplateField[]) || []

  // Published templates only: a draft is not something an advocate can reach,
  // so it cannot be the thing this import would collide with.
  const published = await DocumentTemplate.find({
    _id: { $ne: imported._id },
    status: "published",
  })
    .select("title description category bodyHtml fields latestVersion publishedAt")
    .limit(200)
    .lean()

  const scored = published
    .map((candidate) => {
      const fields = (candidate.fields as TemplateField[]) || []
      return {
        candidate,
        textScore: textSimilarity(imported.bodyHtml, candidate.bodyHtml),
        overlap: fieldKeyOverlap(importedFields, fields),
      }
    })
    .filter(
      (row) => row.textScore >= MIN_TEXT_SIMILARITY || row.overlap.ratio >= MIN_FIELD_OVERLAP
    )
    .sort((a, b) => b.textScore + b.overlap.ratio - (a.textScore + a.overlap.ratio))
    .slice(0, MAX_CANDIDATES)

  if (scored.length === 0) {
    return NextResponse.json({ success: true, candidates: [] })
  }

  let verdicts: z.infer<typeof verdictSchema>["verdicts"] = []
  let verdictError: string | null = null

  try {
    const { object, usage } = await generateObject({
      model: modelFor("balanced"),
      system: DEDUPE_PROMPT,
      schema: verdictSchema,
      prompt: [
        `NEWLY IMPORTED: "${imported.title}" (${imported.category})`,
        plainTextOf(imported.bodyHtml).slice(0, 4000),
        "",
        "CANDIDATES:",
        ...scored.map(
          (row, i) =>
            `--- candidate ${i + 1}, id=${String(row.candidate._id)}: "${row.candidate.title}" (${row.candidate.category}) ---\n` +
            plainTextOf(row.candidate.bodyHtml).slice(0, 4000)
        ),
      ].join("\n"),
      maxOutputTokens: OUTPUT_CAPS.templateDedupe,
      maxRetries: AI_MAX_RETRIES_TIMED,
      abortSignal: AbortSignal.timeout(45_000),
    })
    verdicts = object.verdicts
    // This call used to record nothing, so its spend never reached the
    // breakdown at all.
    await recordAiUsage({
      clerkUid: admin.userId,
      feature: "template-dedupe",
      modelKey: "balanced",
      usage,
    })
  } catch (error) {
    // The structural scores are still worth showing. An admin can compare two
    // forms perfectly well without a model's opinion; losing it must not lose
    // them the comparison.
    verdictError =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        ? "The comparison took too long, so these are ranked by similarity alone."
        : "The AI comparison was unavailable, so these are ranked by similarity alone."
  }

  const candidates = scored.map((row) => {
    const id = String(row.candidate._id)
    const verdict = verdicts.find((v) => v.candidateId === id)
    return {
      id,
      title: row.candidate.title,
      description: row.candidate.description,
      category: row.candidate.category,
      version: row.candidate.latestVersion ?? 1,
      publishedAt: row.candidate.publishedAt,
      textSimilarity: Math.round(row.textScore * 100),
      fieldsShared: row.overlap.shared,
      fieldsTotal: row.overlap.total,
      fieldsOnlyInImport: row.overlap.onlyInA,
      fieldsOnlyInExisting: row.overlap.onlyInB,
      verdict: verdict?.verdict ?? null,
      confidence: verdict ? Math.round(verdict.confidence * 100) : null,
      reason: verdict?.reason ?? "",
      diff: diffLines(row.candidate.bodyHtml, imported.bodyHtml),
    }
  })

  return NextResponse.json({
    success: true,
    imported: {
      id: String(imported._id),
      title: imported.title,
      category: imported.category,
      fieldCount: importedFields.length,
    },
    candidates,
    verdictError,
  })
}
