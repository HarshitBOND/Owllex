import { NextRequest, NextResponse } from "next/server"
import { generateObject } from "ai"
import { z } from "zod"
import {
  enforceRateLimit,
  objectIdSchema,
  parseAndValidateJson,
  requireOwnedCase,
  requireUserContext,
} from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DocumentTemplate from "@/app/api/lib/models/document-template"
import DocumentTemplateVersion from "@/app/api/lib/models/document-template-version"
import Corpus from "@/app/api/lib/models/corpus"
import Case from "@/app/api/lib/models/case"
import CorpusDocument from "@/app/api/lib/models/corpus-document"
import { searchCorpus } from "@/app/api/lib/corpusBackend"
import { factsForFields, factsToValues } from "@/app/api/lib/services/corpusFacts"
import { checkAiAllowance, aiLimitResponse, recordAiUsage } from "@/app/api/lib/services/aiUsage"
import { modelFor } from "@/lib/ai/provider"
import { resolveModel } from "@/lib/ai/models"
import { resolveCaseSources } from "@/lib/templates/case-source"
import type { TemplateField } from "@/lib/templates/fields"

/**
 * Fills as much of a form as the app can actually support, so the advocate is
 * asked as few questions as possible.
 *
 * Three layers, in order of how much they can be trusted and how little they
 * cost:
 *
 *  1. The linked case record. Structured and authoritative -- the court, the
 *     case number, the next hearing date. One indexed read.
 *
 *  2. Facts already recorded from earlier forms in this corpus. An exact key
 *     lookup: no model call, no embeddings, instant. On a corpus used before,
 *     this alone answers most of a repeat form, which is what makes the second
 *     one feel automatic.
 *
 *  3. Retrieval over the corpus documents for whatever is still unanswered. One
 *     query built from the whole field list rather than one per field -- the
 *     chunks overlap heavily, so per-field queries would cost many times more
 *     and return substantially the same text.
 *
 * A retrieved value is only ever accepted with a verbatim quote from a chunk
 * behind it. An invented Tehsil on an address for service is worse than a blank
 * one: the blank gets noticed.
 *
 * Every layer is best-effort. Anything unresolved simply stays unanswered and
 * becomes a question -- no field can end up silently blank on a filed document
 * because a source was missing.
 */
export const maxDuration = 60

const RETRIEVAL_K = 12

const bodySchema = z.object({
  corpusId: z.string().trim().min(1).max(64).optional(),
  caseId: z.string().optional(),
  /** Already answered, so retrieval is not spent re-deriving them. */
  known: z.record(z.string(), z.unknown()).optional(),
})

const fillSchema = z.object({
  values: z.array(
    z.object({
      key: z.string().describe("The field key, exactly as given."),
      value: z.string(),
      confidence: z.number().min(0).max(1),
      quote: z
        .string()
        .min(1)
        .describe("The verbatim sentence from the excerpts that supports this value."),
      documentId: z.string().describe("The id of the excerpt the quote came from."),
    })
  ),
})

const FILL_PROMPT = `You fill in Indian court forms from a lawyer's own case documents.

You are given a list of fields and some excerpts from documents in this matter.
Return a value for a field ONLY when an excerpt states it.

Rules:
- Every value must be supported by a verbatim quote from the excerpts. Copy the
  sentence exactly. If you cannot quote it, omit the field entirely.
- Never infer, never average, never fill something in because it is the obvious
  guess. An omitted field simply gets asked; a wrong one goes on a court filing.
- Copy names, addresses and numbers exactly as written, including spelling.
- Dates: return ISO format (YYYY-MM-DD) when the excerpt gives a full date.
- For a field whose key ends in ".0", ".1" and so on, these are rows of a table
  (parties, for instance). Fill row 0 from the first such person the documents
  describe, row 1 from the second, and so on. Do not invent extra rows.
- confidence reflects how squarely the quote answers the field, not how likely
  you think the value is.`

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  const parsed = await parseAndValidateJson(request, bodySchema)
  if (!parsed.success) return parsed.response

  const { corpusId, caseId, known = {} } = parsed.data

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `corpus-fill:${userContext.clerkUid}`,
    max: 30,
    windowMs: 10 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  await connectMongoWithRetry()

  if (corpusId && !(await Corpus.exists({ clerkUid: userContext.clerkUid, corpusId }))) {
    return NextResponse.json({ success: false, error: "Corpus not found" }, { status: 404 })
  }

  // Checked before a single value is read: without it, passing any case id
  // would pull another firm's court and party details into this form.
  const ownsCase = caseId ? await requireOwnedCase(userContext.clerkUid, caseId) : false
  if (caseId && !ownsCase) {
    return NextResponse.json({ success: false, error: "Case not found" }, { status: 404 })
  }

  const template = await DocumentTemplate.findOne({ _id: id, status: "published" }).lean()
  if (!template) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  const version = template.latestVersion ?? 1
  const snapshot = await DocumentTemplateVersion.findOne({ templateId: id, version }).lean()
  const fields = (snapshot?.fields as TemplateField[]) ?? []

  if (fields.length === 0) {
    return NextResponse.json({
      success: true,
      values: {},
      provenance: {},
      fromCase: 0,
      fromFacts: 0,
      fromDocuments: 0,
    })
  }

  const values: Record<string, unknown> = {}
  const provenance: Record<string, { source: string; documentId?: string; quote?: string }> = {}

  // --- layer 1: the case record, structured and authoritative ---

  let fromCase = 0
  if (ownsCase) {
    const caseDoc = await Case.findOne({ _id: caseId }).lean()
    for (const [key, resolved] of Object.entries(
      resolveCaseSources(fields, caseDoc as Record<string, unknown> | null)
    )) {
      values[key] = resolved.value
      provenance[key] = { source: "case" }
      fromCase++
    }
  }

  // --- layer 2: facts recorded from earlier forms, free and exact ---

  let fromFacts = 0
  if (corpusId) {
    const facts = await factsForFields({ clerkUid: userContext.clerkUid, corpusId, fields })
    for (const [key, value] of Object.entries(factsToValues(fields, facts))) {
      // The case record wins: it is the firm's own structured data, not
      // something recovered from an earlier document.
      if (values[key] !== undefined) continue
      values[key] = value
      provenance[key] = { source: "corpusFact" }
      fromFacts++
    }
  }

  // --- layer 2: retrieval, only for what is still missing ---

  const answered = new Set([
    ...Object.keys(values),
    ...Object.keys(known).filter((k) => String(known[k] ?? "").trim()),
  ])
  const outstanding = fields.filter((f) => !answered.has(f.key))

  if (outstanding.length === 0 || !corpusId) {
    return NextResponse.json({ success: true, values, provenance, fromCase, fromFacts, fromDocuments: 0 })
  }

  const indexed = await CorpusDocument.countDocuments({
    clerkUid: userContext.clerkUid,
    corpusId,
    status: "ready",
  })
  if (indexed === 0) {
    return NextResponse.json({
      success: true,
      values,
      provenance,
      fromCase,
      fromFacts,
      fromDocuments: 0,
      note: "This corpus has no indexed documents yet, so only previously recorded answers were used.",
    })
  }

  const gate = await checkAiAllowance(userContext.clerkUid)
  if (!gate.allowed) return aiLimitResponse(gate)
  const modelKey = resolveModel(gate.snapshot.plan, undefined, "balanced")

  // One query for the whole form. The chunks that mention a court also mention
  // the case number and the parties, so per-field queries would return
  // substantially the same text at many times the cost.
  const query = [
    template.title,
    ...outstanding.map((f) => f.label),
    ...outstanding.flatMap((f) => f.columns.map((c) => c.label)),
  ].join(", ")

  let results: { text: string; document_id: string; title?: string }[] = []
  try {
    const search = await searchCorpus({
      corpusId,
      clerkUid: userContext.clerkUid,
      query,
      k: RETRIEVAL_K,
    })
    results = search.results
  } catch (error) {
    // The facts layer already produced usable answers; losing retrieval must
    // not lose those too.
    return NextResponse.json({
      success: true,
      values,
      provenance,
      fromCase,
      fromFacts,
      fromDocuments: 0,
      note: `Only previously recorded answers were used: ${
        error instanceof Error ? error.message : "corpus search was unavailable"
      }`,
    })
  }

  if (results.length === 0) {
    return NextResponse.json({ success: true, values, provenance, fromCase, fromFacts, fromDocuments: 0 })
  }

  // Table fields are asked for as indexed row keys, so the model can fill a
  // second party without inventing a schema of its own.
  const askedFor = outstanding.flatMap((field) =>
    field.type === "table"
      ? [0, 1, 2].flatMap((row) =>
          field.columns.map((c) => ({
            key: `${field.key}.${row}.${c.key}`,
            label: `${c.label} (${field.label}, entry ${row + 1})`,
            type: c.type,
          }))
        )
      : [{ key: field.key, label: field.label, type: field.type }]
  )

  const docTitles = new Map<string, string>()
  for (const r of results) if (r.title) docTitles.set(r.document_id, r.title)

  let filled: z.infer<typeof fillSchema>["values"] = []
  try {
    const { object, usage } = await generateObject({
      model: modelFor(modelKey),
      system: FILL_PROMPT,
      schema: fillSchema,
      prompt: [
        `FORM: ${template.title}`,
        "",
        "FIELDS TO FILL:",
        ...askedFor.map((f) => `- ${f.key} (${f.type}): ${f.label}`),
        "",
        "EXCERPTS FROM THIS MATTER'S DOCUMENTS:",
        ...results.map(
          (r, i) => `--- excerpt ${i + 1}, documentId=${r.document_id} ---\n${r.text}`
        ),
      ].join("\n"),
      abortSignal: AbortSignal.timeout(45_000),
    })
    filled = object.values
    await recordAiUsage({
      clerkUid: userContext.clerkUid,
      feature: "corpus-fill",
      modelKey,
      usage,
    })
  } catch {
    return NextResponse.json({
      success: true,
      values,
      provenance,
      fromCase,
      fromFacts,
      fromDocuments: 0,
      note: "Only previously recorded answers were used: reading the documents took too long.",
    })
  }

  // Anything the model returned without a quote that actually appears in the
  // excerpts is dropped. This is the check that stops a plausible-looking
  // Tehsil reaching a filed document.
  const corpusText = results.map((r) => r.text).join("\n")
  const validKeys = new Set(askedFor.map((f) => f.key))

  const tableRows = new Map<string, Map<number, Record<string, string>>>()
  let fromDocuments = 0

  for (const entry of filled) {
    if (!validKeys.has(entry.key)) continue
    if (!entry.value.trim()) continue
    if (!entry.quote.trim() || !corpusText.includes(entry.quote.trim())) continue

    const rowMatch = /^([a-z][a-z0-9_]*)\.(\d+)\.([a-z][a-z0-9_]*)$/.exec(entry.key)
    if (rowMatch) {
      const [, base, rowIndex, column] = rowMatch
      const rows = tableRows.get(base) ?? new Map<number, Record<string, string>>()
      rows.set(Number(rowIndex), { ...(rows.get(Number(rowIndex)) ?? {}), [column]: entry.value })
      tableRows.set(base, rows)
    } else {
      values[entry.key] = entry.value
    }

    provenance[entry.key] = {
      source: "corpusDoc",
      documentId: entry.documentId,
      quote: entry.quote.trim(),
    }
    fromDocuments++
  }

  for (const [base, rows] of tableRows) {
    const dense = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row)
    if (dense.length > 0) values[base] = dense
  }

  const sources = [...new Set(filled.map((f) => f.documentId))]
    .map((docId) => docTitles.get(docId))
    .filter(Boolean)

  return NextResponse.json({
    success: true,
    values,
    provenance,
    fromCase,
    fromFacts,
    fromDocuments,
    sources,
  })
}
