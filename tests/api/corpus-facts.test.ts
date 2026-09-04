import { describe, expect, it } from "vitest"
import { buildFactSheet } from "@/lib/templates/fact-sheet"
import { fieldsSchema, type TemplateField } from "@/lib/templates/fields"

// flattenValues / factsToValues are pure but live beside the Mongo models, so
// they are exercised through the service's own module.
import { flattenValues, factsToValues } from "@/app/api/lib/services/corpusFacts"

const FIELDS: TemplateField[] = fieldsSchema.parse([
  { key: "court_name", label: "In the Court of", type: "text", group: "Case details" },
  { key: "hearing_date", label: "Date of Hearing", type: "date", group: "Case details" },
  {
    key: "parties",
    label: "Address rows",
    type: "table",
    columns: [
      { key: "name", label: "Name with Father's Name", type: "text", required: true },
      { key: "tehsil", label: "Tehsil", type: "text", required: false },
    ],
  },
])

describe("flattenValues", () => {
  it("flattens scalars with their labels and groups", () => {
    const out = flattenValues(FIELDS, { court_name: "Civil Judge, Ambala" })
    expect(out).toEqual([
      {
        key: "court_name",
        label: "In the Court of",
        value: "Civil Judge, Ambala",
        valueType: "text",
        group: "Case details",
      },
    ])
  })

  it("flattens each table cell under an indexed key", () => {
    const out = flattenValues(FIELDS, {
      parties: [
        { name: "Sohan Singh", tehsil: "Naraingarh" },
        { name: "Ram Lal", tehsil: "" },
      ],
    })
    expect(out.map((f) => f.key)).toEqual([
      "parties.0.name",
      "parties.0.tehsil",
      "parties.1.name",
    ])
  })

  it("skips blank and whitespace-only answers", () => {
    expect(flattenValues(FIELDS, { court_name: "   ", hearing_date: "" })).toEqual([])
  })
})

describe("factsToValues", () => {
  it("round-trips scalars and rebuilds table rows in order", () => {
    const values = {
      court_name: "Civil Judge, Ambala",
      parties: [
        { name: "Sohan Singh", tehsil: "Naraingarh" },
        { name: "Ram Lal", tehsil: "Ambala" },
      ],
    }
    const facts = Object.fromEntries(
      flattenValues(FIELDS, values).map((f) => [f.key, { value: f.value }])
    )
    expect(factsToValues(FIELDS, facts)).toEqual(values)
  })

  it("ignores a column the form no longer has", () => {
    const out = factsToValues(FIELDS, { "parties.0.pincode": { value: "134203" } })
    expect(out.parties).toBeUndefined()
  })

  it("closes gaps left by a removed row rather than leaving holes", () => {
    const out = factsToValues(FIELDS, {
      "parties.0.name": { value: "Sohan Singh" },
      "parties.2.name": { value: "Ram Lal" },
    })
    expect(out.parties).toEqual([{ name: "Sohan Singh" }, { name: "Ram Lal" }])
  })
})

describe("buildFactSheet", () => {
  const now = new Date("2026-09-04T00:00:00Z")

  it("returns nothing when there are no facts, so an empty sheet is never indexed", () => {
    expect(buildFactSheet({ corpusName: "Ram Lal v. Sohan Singh", facts: [], now })).toBe("")
  })

  it("groups scalars under their section heading", () => {
    const sheet = buildFactSheet({
      corpusName: "Ram Lal v. Sohan Singh",
      facts: [
        { key: "court_name", label: "In the Court of", value: "Civil Judge, Ambala", group: "Court" },
      ],
      now,
    })
    expect(sheet).toContain("# Case facts — Ram Lal v. Sohan Singh")
    expect(sheet).toContain("## Court")
    expect(sheet).toContain("- In the Court of: Civil Judge, Ambala")
  })

  it("keeps each party's details together instead of scattering them", () => {
    const sheet = buildFactSheet({
      corpusName: "Ram Lal v. Sohan Singh",
      facts: [
        { key: "parties.0.name", label: "Name with Father's Name", value: "Sohan Singh" },
        { key: "parties.0.tehsil", label: "Tehsil", value: "Naraingarh" },
        { key: "parties.1.name", label: "Name with Father's Name", value: "Ram Lal" },
      ],
      now,
    })
    const entry1 = sheet.indexOf("### Entry 1")
    const entry2 = sheet.indexOf("### Entry 2")
    expect(entry1).toBeGreaterThan(-1)
    expect(entry2).toBeGreaterThan(entry1)
    expect(sheet.slice(entry1, entry2)).toContain("Naraingarh")
  })
})
