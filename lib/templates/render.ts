import type { TemplateField } from "./fields"
import { TOKEN_RE } from "./fields"

/**
 * Substitutes field values into a template body.
 *
 * Deliberately free of cheerio and of any DOM: the wizard renders a live
 * preview on every keystroke, and pulling a full HTML parser into that bundle
 * to replace a handful of tokens would cost more than the whole feature. String
 * work is also what makes this importable unchanged on both sides.
 *
 * Repeating rows carry no markers of their own. A `<tr>` is a repeating row
 * precisely because it contains `{{parties.something}}` tokens, so the row is
 * found from the tokens rather than from a `data-repeat` attribute or a
 * `{{#each}}` marker. That matters twice over: a bare text marker inside a
 * `<table>` gets foster-parented out of the table by every HTML parser there
 * is, and a custom attribute would be dropped by the sanitizer's allowlist and
 * by TipTap the first time an admin edited the body.
 */

const BLANK_RULE = "________"
const BLANK_CELL = "&nbsp;"
const CLOSE_TR = "</tr>"

export type FieldValues = Record<string, unknown>

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Values reach here from a date input as ISO, but also from the corpus and from
 * the advocate typing "14 October 2026" by hand. Only the unambiguous ISO form
 * is reformatted to the DD-MM-YYYY the registries use; anything else is the
 * user's own wording and is left exactly as written.
 */
function formatScalar(type: string, raw: unknown): string {
  if (raw === null || raw === undefined) return ""
  const value = String(raw).trim()
  if (!value) return ""

  if (type === "date") {
    const match = ISO_DATE.exec(value)
    if (match) return `${match[3]}-${match[2]}-${match[1]}`
  }
  return value
}

/** Locates the `<tr>` that carries this table's tokens, so it can be cloned per row. */
function findRowTemplate(html: string, key: string) {
  const tokenIndex = html.search(new RegExp(`\\{\\{\\s*${key}\\.`))
  if (tokenIndex < 0) return null

  // Walk back to the nearest genuine `<tr` tag start. A substring match inside
  // an attribute value would otherwise cut the row in the wrong place.
  let start = -1
  for (let i = tokenIndex; i >= 0; i--) {
    const candidate = html.lastIndexOf("<tr", i)
    if (candidate < 0) break
    const next = html[candidate + 3]
    if (next === ">" || next === " " || next === "\n" || next === "\t" || next === "\r") {
      start = candidate
      break
    }
    i = candidate
  }
  if (start < 0) return null

  const close = html.indexOf(CLOSE_TR, tokenIndex)
  if (close < 0) return null

  const end = close + CLOSE_TR.length
  return { start, end, row: html.slice(start, end) }
}

function fillRow(rowHtml: string, field: TemplateField, row: Record<string, unknown> | null) {
  return rowHtml.replace(TOKEN_RE, (raw, key: string, column?: string) => {
    if (key !== field.key || !column) return raw
    const col = field.columns.find((c) => c.key === column)
    if (!col) return BLANK_CELL
    const value = formatScalar(col.type, row?.[column])
    return value ? escapeHtml(value) : BLANK_CELL
  })
}

function expandTable(html: string, field: TemplateField, values: FieldValues) {
  const template = findRowTemplate(html, field.key)
  const raw = values[field.key]
  const rows = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : []

  // No `<tr>` around the tokens -- the body uses this table's columns somewhere
  // that cannot repeat. Fill from the first row and leave the structure alone.
  if (!template) {
    return html.replace(TOKEN_RE, (token, key: string, column?: string) => {
      if (key !== field.key || !column) return token
      const col = field.columns.find((c) => c.key === column)
      if (!col) return BLANK_CELL
      const value = formatScalar(col.type, rows[0]?.[column])
      return value ? escapeHtml(value) : BLANK_CELL
    })
  }

  // An unfilled table still has to look like the court's form, which prints
  // blank rows for the advocate to complete by hand.
  const source: (Record<string, unknown> | null)[] = rows.length > 0 ? rows : [null]
  const expanded = source.map((row) => fillRow(template.row, field, row)).join("\n")

  return html.slice(0, template.start) + expanded + html.slice(template.end)
}

/**
 * Renders `bodyHtml` with `values` substituted in.
 *
 * Every value is HTML-escaped on the way in. These strings come from an
 * advocate's keyboard, from a corpus document and from a model, and they are
 * being spliced into markup that is then rendered as HTML -- escaping here is
 * what stops a party name closing a tag. Callers still pass the result through
 * sanitizeDocumentHtml before storing it; this is the inner of the two guards,
 * not a replacement for it.
 */
export function renderTemplate(bodyHtml: string, fields: TemplateField[], values: FieldValues): string {
  if (!bodyHtml) return ""

  let html = bodyHtml

  for (const field of fields) {
    if (field.type === "table") html = expandTable(html, field, values)
  }

  const scalars = new Map(fields.filter((f) => f.type !== "table").map((f) => [f.key, f]))

  html = html.replace(TOKEN_RE, (raw, key: string, column?: string) => {
    if (column) return raw
    const field = scalars.get(key)
    if (!field) return raw
    const value = formatScalar(field.type, values[key])
    return value ? escapeHtml(value) : BLANK_RULE
  })

  // Anything still in braces names nothing this template defines. Parity
  // validation rejects that at save time, but a body that slipped through must
  // never print "{{court_name}}" on a document going to a registry -- a blank
  // the advocate can see and fill is the safe failure.
  return html.replace(TOKEN_RE, BLANK_RULE)
}

/**
 * Fields still needing an answer -- what the wizard has left to ask, and what
 * the AI must ask for rather than invent.
 *
 * Tables are judged per row, not as a whole: an optional table need not have
 * rows, but a row the advocate has started must satisfy its required columns.
 */
export function missingRequired(fields: TemplateField[], values: FieldValues): TemplateField[] {
  const scalars = fields.filter((field) => {
    if (field.type === "table" || !field.required) return false

    return !String(values[field.key] ?? "").trim()
  })

  const tables = fields.filter((f) => f.type === "table").filter((field) => {
    const raw = values[field.key]
    const rows = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : []
    const started = rows.filter((row) => Object.values(row ?? {}).some((v) => String(v ?? "").trim()))

    // An optional table means the advocate need not add rows at all -- but a row
    // they did start has to be complete, or the form goes to the registry with a
    // party listed and no name against them.
    if (started.length === 0) return field.required

    const requiredCols = field.columns.filter((c) => c.required)
    return started.some((row) => requiredCols.some((col) => !String(row[col.key] ?? "").trim()))
  })

  return [...scalars, ...tables]
}
