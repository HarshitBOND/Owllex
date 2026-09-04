import type { TemplateField } from "./fields"

/**
 * Comparing two versions of a form, and moving answers between them.
 *
 * Pure and database-free on purpose: this is the logic that decides what an
 * advocate is told they will lose by updating, so it needs to be directly
 * testable rather than reachable only through a route.
 */

/**
 * A field-level diff between two snapshots, for the "a newer version is
 * available" banner. The advocate needs to judge whether migrating is worth
 * it, which means seeing what actually changed rather than a version number.
 */
export function diffFields(from: TemplateField[], to: TemplateField[]) {
  const fromByKey = new Map(from.map((f) => [f.key, f]))
  const toByKey = new Map(to.map((f) => [f.key, f]))

  const added = to.filter((f) => !fromByKey.has(f.key))
  const removed = from.filter((f) => !toByKey.has(f.key))
  const retyped = to.filter((f) => {
    const before = fromByKey.get(f.key)
    return before && before.type !== f.type
  })
  const relabelled = to.filter((f) => {
    const before = fromByKey.get(f.key)
    return before && before.type === f.type && before.label !== f.label
  })

  return { added, removed, retyped, relabelled }
}

/**
 * Carries values from an old snapshot onto a new one.
 *
 * Values move by field key. A key that no longer exists, or whose type changed
 * in a way the old value cannot satisfy, is reported rather than silently
 * dropped -- the advocate is told what did not come across.
 */
export function migrateValues(
  values: Record<string, unknown>,
  from: TemplateField[],
  to: TemplateField[]
): { values: Record<string, unknown>; dropped: { key: string; label: string; reason: string }[] } {
  const fromByKey = new Map(from.map((f) => [f.key, f]))
  const next: Record<string, unknown> = {}
  const dropped: { key: string; label: string; reason: string }[] = []

  for (const field of to) {
    const before = fromByKey.get(field.key)
    if (!before) continue
    const value = values[field.key]
    if (value === undefined || value === null || value === "") continue

    if (before.type !== field.type) {
      const bothScalar = before.type !== "table" && field.type !== "table"
      if (!bothScalar) {
        dropped.push({
          key: field.key,
          label: before.label,
          reason: `changed from ${before.type} to ${field.type}`,
        })
        continue
      }
    }

    if (field.type === "select" && !field.options.includes(String(value))) {
      dropped.push({
        key: field.key,
        label: before.label,
        reason: `"${String(value)}" is no longer one of the choices`,
      })
      continue
    }

    next[field.key] = value
  }

  for (const field of from) {
    if (values[field.key] && !to.some((f) => f.key === field.key)) {
      dropped.push({ key: field.key, label: field.label, reason: "removed from the form" })
    }
  }

  return { values: next, dropped }
}
