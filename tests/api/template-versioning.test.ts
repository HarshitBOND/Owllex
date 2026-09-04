import { describe, expect, it } from "vitest"
import { diffFields, migrateValues } from "@/lib/templates/versioning"
import { fieldsSchema, type TemplateField } from "@/lib/templates/fields"

function build(specs: Partial<TemplateField>[]): TemplateField[] {
  return fieldsSchema.parse(specs.map((s) => ({ label: s.key, type: "text", ...s })))
}

const V1 = build([
  { key: "court_name", label: "In the Court of" },
  { key: "suit_no", label: "Suit" },
  { key: "party_role", label: "This address is for the", type: "select", options: ["Plaintiff", "Defendant"] },
])

describe("diffFields", () => {
  it("reports an added field", () => {
    const v2 = build([...V1, { key: "hearing_date", label: "Date of Hearing", type: "date" }])
    expect(diffFields(V1, v2).added.map((f) => f.key)).toEqual(["hearing_date"])
  })

  it("reports a removed field", () => {
    const v2 = V1.filter((f) => f.key !== "suit_no")
    expect(diffFields(V1, v2).removed.map((f) => f.key)).toEqual(["suit_no"])
  })

  it("separates a retype from a relabel", () => {
    const v2 = build([
      { key: "court_name", label: "In the Court of", type: "longtext" },
      { key: "suit_no", label: "Suit number" },
      { key: "party_role", label: "This address is for the", type: "select", options: ["Plaintiff", "Defendant"] },
    ])
    const diff = diffFields(V1, v2)
    expect(diff.retyped.map((f) => f.key)).toEqual(["court_name"])
    expect(diff.relabelled.map((f) => f.key)).toEqual(["suit_no"])
  })

  it("reports nothing for an identical field list", () => {
    const diff = diffFields(V1, V1)
    expect([diff.added, diff.removed, diff.retyped, diff.relabelled].every((a) => a.length === 0)).toBe(true)
  })
})

describe("migrateValues", () => {
  it("carries values across by key", () => {
    const v2 = build([...V1, { key: "hearing_date", label: "Date of Hearing", type: "date" }])
    const out = migrateValues({ court_name: "Ambala", suit_no: "CS/412/2025" }, V1, v2)
    expect(out.values).toEqual({ court_name: "Ambala", suit_no: "CS/412/2025" })
    expect(out.dropped).toEqual([])
  })

  it("reports a value whose field was removed instead of dropping it silently", () => {
    const v2 = V1.filter((f) => f.key !== "suit_no")
    const out = migrateValues({ court_name: "Ambala", suit_no: "CS/412/2025" }, V1, v2)
    expect(out.values.suit_no).toBeUndefined()
    expect(out.dropped).toEqual([
      { key: "suit_no", label: "Suit", reason: "removed from the form" },
    ])
  })

  it("drops a select value that is no longer one of the choices, and says so", () => {
    const v2 = build([
      { key: "court_name", label: "In the Court of" },
      { key: "suit_no", label: "Suit" },
      { key: "party_role", label: "This address is for the", type: "select", options: ["Plaintiff", "Applicant"] },
    ])
    const out = migrateValues({ party_role: "Defendant" }, V1, v2)
    expect(out.values.party_role).toBeUndefined()
    expect(out.dropped[0].reason).toContain("no longer one of the choices")
  })

  it("carries a value between two scalar types", () => {
    const v2 = build([
      { key: "court_name", label: "In the Court of", type: "longtext" },
      { key: "suit_no", label: "Suit" },
      { key: "party_role", label: "This address is for the", type: "select", options: ["Plaintiff", "Defendant"] },
    ])
    expect(migrateValues({ court_name: "Ambala" }, V1, v2).values.court_name).toBe("Ambala")
  })

  it("refuses to carry a scalar into a table, and reports the change", () => {
    const from = build([{ key: "parties", label: "Parties" }])
    const to = fieldsSchema.parse([
      {
        key: "parties",
        label: "Parties",
        type: "table",
        columns: [{ key: "name", label: "Name", type: "text", required: true }],
      },
    ])
    const out = migrateValues({ parties: "Sohan Singh" }, from, to)
    expect(out.values.parties).toBeUndefined()
    expect(out.dropped[0].reason).toContain("changed from text to table")
  })

  it("ignores empty answers rather than reporting them as losses", () => {
    const v2 = V1.filter((f) => f.key !== "suit_no")
    expect(migrateValues({ suit_no: "" }, V1, v2).dropped).toEqual([])
  })
})
