/**
 * Renders collected facts as a Markdown sheet for the vector index.
 *
 * Two layers store the same knowledge for different jobs: CorpusFact rows
 * answer "what is this form's court_name" by exact lookup, instantly and with
 * no model call; this sheet makes the same facts findable by the RAG assistant
 * and free-text corpus search, which only see indexed documents.
 *
 * Markdown because the Python ingest route already accepts `.md`, so mirroring
 * facts into the index needs no backend change at all.
 */

export type SheetFact = {
  key: string
  label: string
  value: string
  group?: string
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }

/** "parties.0.tehsil" -> { base: "parties", row: 0, column: "tehsil" } */
function parseKey(key: string) {
  const match = /^([a-z][a-z0-9_]*)\.(\d+)\.([a-z][a-z0-9_]*)$/.exec(key)
  if (!match) return null
  return { base: match[1], row: Number(match[2]), column: match[3] }
}

export function buildFactSheet(opts: {
  corpusName: string
  facts: SheetFact[]
  now?: Date
}): string {
  const { corpusName, facts } = opts
  const now = opts.now ?? new Date()

  if (facts.length === 0) return ""

  const lines: string[] = [
    `# Case facts — ${corpusName}`,
    "",
    `_Collected from forms drafted in this corpus. Last updated ${now.toLocaleDateString(
      "en-IN",
      DATE_FORMAT
    )}._`,
    "",
  ]

  // Scalars grouped by the section they were captured under, so the sheet reads
  // in the same order the form asked.
  const scalars = facts.filter((f) => !parseKey(f.key))
  const groups = [...new Set(scalars.map((f) => f.group || "Details"))]

  for (const group of groups) {
    const inGroup = scalars.filter((f) => (f.group || "Details") === group)
    if (inGroup.length === 0) continue
    lines.push(`## ${group}`)
    for (const fact of inGroup) {
      lines.push(`- ${fact.label || fact.key}: ${fact.value}`)
    }
    lines.push("")
  }

  // Repeating rows are reassembled into one block per entry, so a party's name
  // and their tehsil stay together instead of scattering across the sheet.
  const rows = new Map<string, SheetFact[]>()
  for (const fact of facts) {
    const parsed = parseKey(fact.key)
    if (!parsed) continue
    const id = `${parsed.base}#${parsed.row}`
    rows.set(id, [...(rows.get(id) ?? []), fact])
  }

  if (rows.size > 0) {
    const bases = [...new Set([...rows.keys()].map((id) => id.split("#")[0]))]
    for (const base of bases) {
      lines.push(`## ${base.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}`)
      const ids = [...rows.keys()]
        .filter((id) => id.startsWith(`${base}#`))
        .sort((a, b) => Number(a.split("#")[1]) - Number(b.split("#")[1]))
      for (const id of ids) {
        const index = Number(id.split("#")[1]) + 1
        lines.push(`### Entry ${index}`)
        for (const fact of rows.get(id) ?? []) {
          lines.push(`- ${fact.label || fact.key}: ${fact.value}`)
        }
        lines.push("")
      }
    }
  }

  return lines.join("\n").trim()
}
