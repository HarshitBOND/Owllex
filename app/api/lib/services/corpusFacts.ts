import { createHash } from "crypto"
import mongoose from "mongoose"
import CorpusFact from "@/app/api/lib/models/corpus-fact"
import Corpus from "@/app/api/lib/models/corpus"
import { deleteCorpusVectors, ingestCorpusDocument } from "@/app/api/lib/corpusBackend"
import { buildFactSheet } from "@/lib/templates/fact-sheet"
import type { TemplateField } from "@/lib/templates/fields"

/**
 * Recording what an advocate tells a form, so the next form asks less.
 *
 * Only values they typed or confirmed are kept. A value that came back out of
 * the corpus is not written back -- otherwise retrieval noise would harden into
 * recorded fact over a few documents, and nobody would be able to tell which
 * facts a human had ever actually vouched for.
 */

/** Provenance values that represent a human having stood behind the answer. */
const TRUSTED_SOURCES = new Set(["user", "wizard", "user-edit", "case"])

/** The stable per-corpus document id the fact sheet is indexed under. */
function factSheetDocumentId(corpusId: string) {
  return `facts-${corpusId}`
}

type Provenance = Record<string, { source?: string } | undefined>

export type FlatFact = {
  /** "court_name", or "parties.0.tehsil" for a cell inside a repeating table. */
  key: string
  label: string
  value: string
  valueType: "text" | "date" | "number" | "select"
  group: string
}

/** Flattens field values into one row per answered scalar, tables included. */
export function flattenValues(
  fields: TemplateField[],
  values: Record<string, unknown>
): FlatFact[] {
  const out: FlatFact[] = []

  for (const field of fields) {
    if (field.type === "table") {
      const rows = Array.isArray(values[field.key]) ? (values[field.key] as Record<string, unknown>[]) : []
      rows.forEach((row, index) => {
        for (const column of field.columns) {
          const raw = String(row?.[column.key] ?? "").trim()
          if (!raw) continue
          out.push({
            key: `${field.key}.${index}.${column.key}`,
            label: column.label,
            value: raw,
            valueType: column.type,
            group: field.label || field.group,
          })
        }
      })
      continue
    }

    const raw = String(values[field.key] ?? "").trim()
    if (!raw) continue
    out.push({
      key: field.key,
      label: field.label,
      value: raw,
      valueType: field.type === "longtext" ? "text" : (field.type as "text" | "date" | "number" | "select"),
      group: field.group || "Details",
    })
  }

  return out
}

/**
 * Writes this draft's answers into the corpus.
 *
 * Supersedes rather than overwrites: changing an answer marks the old row
 * superseded and inserts a new one, so the corpus keeps a readable history of
 * what a document said and when.
 */
export async function recordFacts(opts: {
  clerkUid: string
  corpusId: string
  fields: TemplateField[]
  values: Record<string, unknown>
  provenance?: Provenance
  draftId?: mongoose.Types.ObjectId | string | null
  templateId?: mongoose.Types.ObjectId | string | null
  templateVersion?: number
}): Promise<{ written: number; skipped: number }> {
  const { clerkUid, corpusId, fields, values } = opts
  const provenance = opts.provenance ?? {}

  const flattened = flattenValues(fields, values)

  let written = 0
  let skipped = 0

  for (const entry of flattened) {
    // A table cell's provenance is recorded against its field, not its cell.
    const baseKey = entry.key.includes(".") ? entry.key.split(".")[0] : entry.key
    const source = provenance[entry.key]?.source ?? provenance[baseKey]?.source ?? "wizard"

    if (!TRUSTED_SOURCES.has(source)) {
      skipped++
      continue
    }

    const current = await CorpusFact.findOne({
      clerkUid,
      corpusId,
      key: entry.key,
      supersededAt: null,
    })

    if (current) {
      if (current.value === entry.value) continue
      current.supersededAt = new Date()
      await current.save()
    }

    await CorpusFact.create({
      clerkUid,
      corpusId,
      key: entry.key,
      label: entry.label,
      value: entry.value,
      valueType: entry.valueType,
      sourceType: source === "case" ? "case" : source === "user" ? "user-edit" : "wizard",
      sourceDraftId: opts.draftId ?? null,
      sourceTemplateId: opts.templateId ?? null,
      sourceTemplateVersion: opts.templateVersion ?? 0,
      confidence: 1,
    })
    written++
  }

  return { written, skipped }
}

/**
 * Exact-match lookup used before any retrieval or model call.
 *
 * On a corpus that has been used before, this alone answers most of a repeat
 * form -- which is the whole point: it costs one indexed query and nothing else.
 */
export async function factsForFields(opts: {
  clerkUid: string
  corpusId: string
  fields: TemplateField[]
}): Promise<Record<string, { value: string; source: "corpusFact"; label: string }>> {
  const { clerkUid, corpusId, fields } = opts

  const wanted = new Set<string>()
  for (const field of fields) {
    if (field.type === "table") wanted.add(field.key)
    else wanted.add(field.key)
  }

  const rows = await CorpusFact.find({ clerkUid, corpusId, supersededAt: null }).lean()

  const out: Record<string, { value: string; source: "corpusFact"; label: string }> = {}
  for (const row of rows) {
    const base = row.key.includes(".") ? row.key.split(".")[0] : row.key
    if (!wanted.has(base)) continue
    out[row.key] = { value: row.value, source: "corpusFact", label: row.label }
  }
  return out
}

/** Rebuilds table values from flattened "parties.0.tehsil" fact keys. */
export function factsToValues(
  fields: TemplateField[],
  facts: Record<string, { value: string }>
): Record<string, unknown> {
  const values: Record<string, unknown> = {}

  for (const field of fields) {
    if (field.type !== "table") {
      const fact = facts[field.key]
      if (fact) values[field.key] = fact.value
      continue
    }

    const rows: Record<string, unknown>[] = []
    for (const [key, fact] of Object.entries(facts)) {
      const match = new RegExp(`^${field.key}\\.(\\d+)\\.([a-z][a-z0-9_]*)$`).exec(key)
      if (!match) continue
      const index = Number(match[1])
      const column = match[2]
      if (!field.columns.some((c) => c.key === column)) continue
      rows[index] = { ...(rows[index] ?? {}), [column]: fact.value }
    }

    const dense = rows.filter(Boolean)
    if (dense.length > 0) values[field.key] = dense
  }

  return values
}

/**
 * Mirrors the current facts into the vector index as one Markdown document.
 *
 * Skipped when the sheet is byte-identical to the last one indexed, so a run of
 * saves that changes nothing costs no embeddings. Never throws: the facts
 * themselves are already stored and usable, and failing to mirror them into
 * search must not fail the advocate's save.
 */
export async function syncFactSheet(opts: {
  clerkUid: string
  corpusId: string
}): Promise<{ synced: boolean; reason?: string }> {
  const { clerkUid, corpusId } = opts

  try {
    const corpus = await Corpus.findOne({ clerkUid, corpusId })
    if (!corpus) return { synced: false, reason: "corpus-not-found" }

    const rows = await CorpusFact.find({ clerkUid, corpusId, supersededAt: null })
      .sort({ key: 1 })
      .lean()

    const sheet = buildFactSheet({
      corpusName: corpus.name || "This corpus",
      facts: rows.map((r) => ({ key: r.key, label: r.label, value: r.value })),
    })

    // Every fact has been forgotten. The indexed sheet has to go with them, or
    // a detail the advocate deleted keeps coming back through search.
    if (!sheet) {
      if (corpus.factSheetHash) {
        await deleteCorpusVectors({
          corpusId,
          clerkUid,
          documentId: factSheetDocumentId(corpusId),
        }).catch(() => {})
        corpus.factSheetHash = ""
        corpus.factSheetSyncedAt = new Date()
        await corpus.save()
        return { synced: true, reason: "cleared" }
      }
      return { synced: false, reason: "no-facts" }
    }

    // The date line changes daily, so it is excluded from the hash -- otherwise
    // every corpus would re-index once a day for no reason.
    const hash = createHash("sha256")
      .update(sheet.replace(/^_Collected from.*$/m, ""))
      .digest("hex")

    if (corpus.factSheetHash === hash) return { synced: false, reason: "unchanged" }

    const documentId = factSheetDocumentId(corpusId)

    // The previous edition is removed first, or the index would accumulate one
    // stale copy of these facts per save.
    await deleteCorpusVectors({ corpusId, clerkUid, documentId }).catch(() => {})

    await ingestCorpusDocument({
      corpusId,
      clerkUid,
      documentId,
      filename: "case-facts.md",
      bytes: Buffer.from(sheet, "utf8"),
      mimeType: "text/markdown",
    })

    corpus.factSheetHash = hash
    corpus.factSheetSyncedAt = new Date()
    await corpus.save()

    return { synced: true }
  } catch (error) {
    return {
      synced: false,
      reason: error instanceof Error ? error.message : "sync-failed",
    }
  }
}

/** Removes every fact a corpus has collected, and its indexed sheet with them. */
export async function forgetFacts(opts: { clerkUid: string; corpusId: string }) {
  const { clerkUid, corpusId } = opts
  const result = await CorpusFact.deleteMany({ clerkUid, corpusId })

  await deleteCorpusVectors({ corpusId, clerkUid, documentId: factSheetDocumentId(corpusId) }).catch(
    () => {}
  )
  await Corpus.updateOne(
    { clerkUid, corpusId },
    { $set: { factSheetHash: "", factSheetSyncedAt: null } }
  )

  return { deleted: result.deletedCount ?? 0 }
}
