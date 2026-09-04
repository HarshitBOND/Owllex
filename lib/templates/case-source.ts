import type { TemplateField } from "./fields"

/**
 * Maps a field's `source` onto a case record.
 *
 * A source is a hint, never a guarantee. Cases in this app are populated from
 * several places -- hand entry, the cause-list parser, the scraper -- and any
 * given field may simply be blank, or the draft may have no case linked at all.
 * Every resolver here returns only non-empty values, so an unresolved source
 * falls through to being asked in the wizard rather than leaving a blank on a
 * document heading to a registry.
 */

/** The case fields worth binding to. Kept explicit so the extraction model cannot invent paths. */
export const CASE_SOURCES = [
  "case.caseNo",
  "case.cnrNo",
  "case.caseTitle",
  "case.fileNo",
  "case.courtName",
  "case.courtRoom",
  "case.courtDate",
  "case.advocate",
  "case.fillingAdvocate",
  "case.caseStage",
  "case.registrationDate",
  "case.fillingDate",
] as const

export type CaseSource = (typeof CASE_SOURCES)[number]

export function isCaseSource(value: string | null | undefined): value is CaseSource {
  return !!value && (CASE_SOURCES as readonly string[]).includes(value)
}

/** Describes each source in the admin's own words, for the field editor's dropdown. */
export const CASE_SOURCE_LABELS: Record<CaseSource, string> = {
  "case.caseNo": "Case number",
  "case.cnrNo": "CNR number",
  "case.caseTitle": "Case title (e.g. Ram Lal v. Sohan Singh)",
  "case.fileNo": "File number",
  "case.courtName": "Court name",
  "case.courtRoom": "Court room",
  "case.courtDate": "Next date of hearing",
  "case.advocate": "Advocate",
  "case.fillingAdvocate": "Filing advocate",
  "case.caseStage": "Stage",
  "case.registrationDate": "Registration date",
  "case.fillingDate": "Filing date",
}

type CaseLike = Record<string, unknown>

export type ResolvedValue = { value: string; source: "case" }

/**
 * Reads the values a case can supply for these fields.
 *
 * Returns a partial map: keys absent from it are exactly the fields the wizard
 * still has to ask about. Table fields are never sourced from a case -- a case
 * record holds one court and one number, not a list of parties to serve.
 */
export function resolveCaseSources(
  fields: TemplateField[],
  caseDoc: CaseLike | null | undefined
): Record<string, ResolvedValue> {
  if (!caseDoc) return {}

  const out: Record<string, ResolvedValue> = {}

  for (const field of fields) {
    if (field.type === "table") continue
    if (!isCaseSource(field.source)) continue

    const prop = field.source.slice("case.".length)
    const raw = caseDoc[prop]
    const value = raw === null || raw === undefined ? "" : String(raw).trim()
    if (!value) continue

    out[field.key] = { value, source: "case" }
  }

  return out
}
