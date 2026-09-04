import { describe, expect, it } from "vitest"
import { renderTemplate, missingRequired, type FieldValues } from "@/lib/templates/render"
import { validateTokenParity, fieldsSchema, type TemplateField } from "@/lib/templates/fields"

function field(partial: Partial<TemplateField> & { key: string }): TemplateField {
  return fieldsSchema.parse([
    {
      label: partial.key,
      type: "text",
      options: [],
      columns: [],
      required: false,
      group: "",
      source: null,
      overlay: null,
      help: "",
      ...partial,
    },
  ])[0]
}

const partiesField = field({
  key: "parties",
  label: "Address rows",
  type: "table",
  columns: [
    { key: "name", label: "Name with Father's Name", type: "text", options: [], required: true },
    { key: "caste", label: "Caste", type: "text", options: [], required: false },
    { key: "tehsil", label: "Tehsil", type: "text", options: [], required: false },
  ],
})

// The Address Form's own shape: a heading block of scalars over a ruled table
// that the court prints with three blank rows.
const ADDRESS_BODY = `<h1>ADDRESS FORM</h1>
<p><strong>In the Court of :</strong> {{court_name}}</p>
<p><strong>Date of Hearing</strong> {{hearing_date}}</p>
<table><tbody>
<tr><th>Name with Father's Name</th><th>Caste</th><th>Tehsil</th></tr>
<tr><td>{{parties.name}}</td><td>{{parties.caste}}</td><td>{{parties.tehsil}}</td></tr>
</tbody></table>`

const ADDRESS_FIELDS = [
  field({ key: "court_name", label: "In the Court of", required: true, source: "case.courtName" }),
  field({ key: "hearing_date", label: "Date of Hearing", type: "date", source: "case.courtDate" }),
  partiesField,
]

describe("renderTemplate", () => {
  it("substitutes scalar values", () => {
    const html = renderTemplate(ADDRESS_BODY, ADDRESS_FIELDS, {
      court_name: "Civil Judge (Sr. Div.), Ambala",
    })
    expect(html).toContain("Civil Judge (Sr. Div.), Ambala")
    expect(html).not.toContain("{{court_name}}")
  })

  it("leaves a visible rule where a value is missing", () => {
    const html = renderTemplate(ADDRESS_BODY, ADDRESS_FIELDS, {})
    expect(html).toContain("________")
    expect(html).not.toMatch(/\{\{/)
  })

  it("reformats an ISO date to the DD-MM-YYYY registries use, and passes other wording through", () => {
    expect(renderTemplate("<p>{{hearing_date}}</p>", ADDRESS_FIELDS, { hearing_date: "2026-10-14" })).toContain(
      "14-10-2026"
    )
    expect(
      renderTemplate("<p>{{hearing_date}}</p>", ADDRESS_FIELDS, { hearing_date: "next Tuesday" })
    ).toContain("next Tuesday")
  })

  it("repeats the token-bearing row once per party and leaves the header row alone", () => {
    const html = renderTemplate(ADDRESS_BODY, ADDRESS_FIELDS, {
      parties: [
        { name: "Sohan Singh s/o Gurdial Singh", caste: "Jat", tehsil: "Naraingarh" },
        { name: "Ram Lal s/o Kishan Lal", caste: "Ahir", tehsil: "Ambala" },
      ],
    })
    expect(html).toContain("Sohan Singh s/o Gurdial Singh")
    expect(html).toContain("Ram Lal s/o Kishan Lal")
    // header + two filled rows
    expect(html.match(/<tr>/g)).toHaveLength(3)
    expect(html.match(/<th>/g)).toHaveLength(3)
  })

  it("keeps one blank row when the table has no values, as the printed form does", () => {
    const html = renderTemplate(ADDRESS_BODY, ADDRESS_FIELDS, {})
    expect(html.match(/<tr>/g)).toHaveLength(2)
    expect(html).toContain("&nbsp;")
  })

  it("fills only the columns given, blanking the rest of the row", () => {
    const html = renderTemplate(ADDRESS_BODY, ADDRESS_FIELDS, {
      parties: [{ name: "Sohan Singh" }],
    })
    expect(html).toContain("Sohan Singh")
    expect(html).toContain("&nbsp;")
  })

  it("escapes markup in a scalar value so a party name cannot close a tag", () => {
    const html = renderTemplate(ADDRESS_BODY, ADDRESS_FIELDS, {
      court_name: "<script>alert(1)</script>",
    })
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("escapes markup inside a table cell too", () => {
    const html = renderTemplate(ADDRESS_BODY, ADDRESS_FIELDS, {
      parties: [{ name: "</td></tr><script>alert(1)</script>" }],
    })
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;/td&gt;")
  })

  it("blanks a token that names no field rather than printing braces on a court document", () => {
    const html = renderTemplate("<p>{{not_a_field}}</p>", ADDRESS_FIELDS, {})
    expect(html).toBe("<p>________</p>")
  })

  it("tolerates whitespace inside the braces", () => {
    const html = renderTemplate("<p>{{ court_name }}</p>", ADDRESS_FIELDS, { court_name: "Ambala" })
    expect(html).toBe("<p>Ambala</p>")
  })
})

describe("validateTokenParity", () => {
  it("accepts a body and field list that agree", () => {
    expect(validateTokenParity(ADDRESS_BODY, ADDRESS_FIELDS)).toEqual([])
  })

  it("rejects a token no field defines", () => {
    const errors = validateTokenParity(`${ADDRESS_BODY}<p>{{suit_no}}</p>`, ADDRESS_FIELDS)
    expect(errors.join(" ")).toContain("suit_no")
  })

  it("rejects a field the body never renders", () => {
    const errors = validateTokenParity(ADDRESS_BODY, [
      ...ADDRESS_FIELDS,
      field({ key: "caste", label: "Caste" }),
    ])
    expect(errors.join(" ")).toContain("never appears in the body")
  })

  it("rejects an unknown column on a table field", () => {
    const errors = validateTokenParity(`${ADDRESS_BODY}<p>{{parties.pincode}}</p>`, ADDRESS_FIELDS)
    expect(errors.join(" ")).toContain("no column \"pincode\"")
  })

  it("rejects a table used as a scalar", () => {
    const errors = validateTokenParity("<p>{{parties}}</p>", [partiesField])
    expect(errors.join(" ")).toContain("is a table")
  })
})

describe("missingRequired", () => {
  const values: FieldValues = { court_name: "Ambala", parties: [{ name: "Sohan Singh" }] }

  it("reports nothing when required fields are answered", () => {
    expect(missingRequired(ADDRESS_FIELDS, values).map((f) => f.key)).toEqual([])
  })

  it("reports an unanswered required scalar", () => {
    expect(missingRequired(ADDRESS_FIELDS, { parties: [{ name: "x" }] }).map((f) => f.key)).toEqual([
      "court_name",
    ])
  })

  it("reports a table row missing a required column", () => {
    const out = missingRequired(ADDRESS_FIELDS, { court_name: "Ambala", parties: [{ caste: "Jat" }] })
    expect(out.map((f) => f.key)).toEqual(["parties"])
  })

  it("treats whitespace as unanswered", () => {
    expect(missingRequired(ADDRESS_FIELDS, { ...values, court_name: "   " }).map((f) => f.key)).toEqual([
      "court_name",
    ])
  })
})
