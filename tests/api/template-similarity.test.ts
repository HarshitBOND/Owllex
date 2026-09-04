import { describe, expect, it } from "vitest"
import { diffLines, fieldKeyOverlap, plainTextOf, textLinesOf, textSimilarity } from "@/lib/templates/similarity"
import { fieldsSchema, type TemplateField } from "@/lib/templates/fields"

const ADDRESS_A = `<h1>ADDRESS FORM</h1><p>In the Court of : {{court_name}}</p><p>Suit {{suit_no}}</p>`
const ADDRESS_B = `<h1>ADDRESS FORM</h1><p>In the Court of : {{court}}</p><p>Suit {{suit_no}}</p>`
const UNRELATED = `<h1>BAIL APPLICATION</h1><p>Accused {{accused}} seeks regular bail under Section 483 BNSS.</p>`

function fields(keys: string[]): TemplateField[] {
  return fieldsSchema.parse(keys.map((key) => ({ key, label: key, type: "text" })))
}

describe("plainTextOf / textLinesOf", () => {
  it("strips tags and collapses whitespace", () => {
    expect(plainTextOf("<p>In the   Court of</p>")).toBe("In the Court of")
  })

  it("decodes the entities the renderer emits for blank cells", () => {
    expect(plainTextOf("<td>&nbsp;</td>")).toBe("")
    expect(plainTextOf("<p>Ram &amp; Sons</p>")).toBe("Ram & Sons")
  })

  it("breaks block elements into lines and joins table cells", () => {
    expect(textLinesOf("<p>One</p><p>Two</p>")).toEqual(["One", "Two"])
    expect(textLinesOf("<tr><td>Sohan</td><td>Jat</td></tr>")).toEqual(["Sohan | Jat"])
  })
})

describe("textSimilarity", () => {
  it("scores an identical body as 1", () => {
    expect(textSimilarity(ADDRESS_A, ADDRESS_A)).toBe(1)
  })

  it("ignores a renamed token, so two editions of one form still match", () => {
    expect(textSimilarity(ADDRESS_A, ADDRESS_B)).toBe(1)
  })

  it("scores an unrelated form low", () => {
    expect(textSimilarity(ADDRESS_A, UNRELATED)).toBeLessThan(0.4)
  })

  it("does not call a form identical just for reusing vocabulary", () => {
    const short = "<p>court</p>"
    const long = "<p>court court court court court</p>"
    expect(textSimilarity(short, long)).toBeLessThan(0.7)
  })
})

describe("fieldKeyOverlap", () => {
  it("reports what each side has alone", () => {
    const out = fieldKeyOverlap(fields(["court_name", "suit_no"]), fields(["court_name", "hearing_date"]))
    expect(out.shared).toBe(1)
    expect(out.onlyInA).toEqual(["suit_no"])
    expect(out.onlyInB).toEqual(["hearing_date"])
  })

  it("scores identical field lists as a full match", () => {
    expect(fieldKeyOverlap(fields(["a", "b"]), fields(["a", "b"])).ratio).toBe(1)
  })
})

describe("diffLines", () => {
  it("marks unchanged lines as same", () => {
    const out = diffLines("<p>One</p><p>Two</p>", "<p>One</p><p>Two</p>")
    expect(out.every((l) => l.type === "same")).toBe(true)
  })

  it("isolates a single changed line rather than flagging the whole form", () => {
    const out = diffLines("<p>One</p><p>Two</p><p>Three</p>", "<p>One</p><p>Changed</p><p>Three</p>")
    expect(out.filter((l) => l.type === "same").map((l) => l.text)).toEqual(["One", "Three"])
    expect(out.filter((l) => l.type === "remove").map((l) => l.text)).toEqual(["Two"])
    expect(out.filter((l) => l.type === "add").map((l) => l.text)).toEqual(["Changed"])
  })

  it("reports a pure insertion as additions only", () => {
    const out = diffLines("<p>One</p>", "<p>One</p><p>Two</p>")
    expect(out.filter((l) => l.type === "remove")).toHaveLength(0)
    expect(out.filter((l) => l.type === "add").map((l) => l.text)).toEqual(["Two"])
  })
})
