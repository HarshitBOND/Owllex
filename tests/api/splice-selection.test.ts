import { describe, expect, it } from "vitest"
import { selectionCrossesTableBoundary, spliceSelection } from "@/app/api/lib/html/spliceSelection"
import { sanitizeDocumentHtml } from "@/app/api/lib/html/sanitizeHtml"

/**
 * The selected text in every case below is what the editor actually reports for
 * that markup -- `textBetween` with tags gone, whitespace collapsed, and
 * nothing at all in place of a <br>. Each one used to come back as "the
 * selected passage changed while the revision was generating".
 */

/** What the service stores: the splice, then the sanitiser that repairs it. */
function splice(contentHtml: string, selectedText: string, replacement: string) {
  const out = spliceSelection(contentHtml, selectedText, replacement)
  return out === null ? null : sanitizeDocumentHtml(out)
}

describe("spliceSelection", () => {
  it("replaces a passage that sits in plain markup", () => {
    expect(splice("<p>one</p><p>two</p>", "two", "TWO")).toBe("<p>one</p><p>TWO</p>")
  })

  it("returns null when the passage is genuinely gone", () => {
    expect(splice("<p>one</p>", "a missing passage", "<p>new</p>")).toBeNull()
  })

  it("keeps the bold on a word the answer left alone, even from a passage that ran through formatting", () => {
    const out = splice(
      "<p><strong>Place:</strong> Delhi High Court</p>",
      "Place: Delhi High Court",
      "Place: Bombay High Court",
    )
    expect(out).toBe("<p><strong>Place:</strong> Bombay High Court</p>")
  })

  it("replaces a passage the editor reports with no separator across a <br>", () => {
    const out = splice(
      "<p>Place: Delhi High Court<br>Date: 07-09-2024</p>",
      "Place: Delhi High CourtDate: 07-09-2024",
      "Place: Delhi High Court<br>Date: 28-04-2026",
    )
    expect(out).toBe("<p>Place: Delhi High Court<br>Date: 28-04-2026</p>")
  })

  it("replaces a passage spanning two paragraphs without nesting them", () => {
    const out = splice("<p>one</p><p>two</p>", "one two", "<p>ONE</p><p>TWO</p>")
    expect(out).toBe("<p>ONE</p><p>TWO</p>")
  })

  it("keeps the paragraph when the model answers with inline text", () => {
    expect(splice("<p>one two</p>", "one two", "ONE TWO")).toBe("<p>ONE TWO</p>")
  })

  it("tolerates whitespace the editor collapsed but the stored markup kept", () => {
    const out = splice("<p>Delhi  High\n      Court, 07-09-2024</p>", "Delhi High Court, 07-09-2024", "Registered")
    expect(out).toBe("<p>Registered</p>")
  })

  it("matches through an encoded entity", () => {
    const out = splice("<p>M/s A &amp; B Co. Ltd.</p>", "M/s A & B Co. Ltd.", "M/s A &amp; B Company Limited")
    expect(out).toBe("<p>M/s A &amp; B Company Limited</p>")
  })

  it("replaces the whole place-and-date block a plaint ends on", () => {
    const out = splice(
      "<h2>IN THE COURT</h2><p>Place: <strong>Delhi</strong><br>Date: 07-09-2024</p>",
      "Place: DelhiDate: 07-09-2024",
      "<p>Place: Delhi High Court<br>Date: 28-04-2026</p>",
    )
    expect(out).toBe("<h2>IN THE COURT</h2><p>Place: Delhi High Court<br>Date: 28-04-2026</p>")
  })

  it("closes formatting the passage ended inside instead of spreading it", () => {
    const out = splice("<p><strong>bold head</strong> Place: Delhi</p>", "head Place: Delhi", "revised")
    expect(out).toBe("<p><strong>bold </strong>revised</p>")
  })

  it("reopens formatting that carries on past the passage", () => {
    const out = splice("<p>head Place: <em>Delhi tail</em></p>", "Place: Delhi", "revised")
    expect(out).toBe("<p>head revised<em> tail</em></p>")
  })

  it("still reports a mismatch when the words themselves differ", () => {
    expect(splice("<p><strong>Delhi</strong> High Court</p>", "Bombay High Court", "new")).toBeNull()
  })

  it("refuses a loose match stretched across unrelated text", () => {
    const document = `<p>${"filler words here ".repeat(40)}</p>`
    expect(splice(document, "abcdef", "new")).toBeNull()
  })

  it("refuses a passage that crosses a table cell boundary rather than merging the cells", () => {
    const table = "<table><tr><th>Name</th><th>Caste</th><th>Tehsil</th></tr></table>"
    expect(splice(table, "Name Caste", "Name Caste")).toBeNull()
    expect(selectionCrossesTableBoundary(table, "Name Caste")).toBe(true)
  })

  it("still splices a passage that stays inside one table cell", () => {
    const table = "<table><tr><th>Name</th><th>Caste</th></tr></table>"
    expect(splice(table, "Caste", "CASTE")).toBe("<table><tbody><tr><th>Name</th><th>CASTE</th></tr></tbody></table>")
    expect(selectionCrossesTableBoundary(table, "Caste")).toBe(false)
  })

  describe("a selection spanning several paragraphs", () => {
    /** What getEditorSelection now reports: a blank line between blocks, not a single space. */
    const form =
      "<p><strong>In the Court of :</strong> ____</p>" +
      "<p><strong>Case</strong> ____ <strong>Versus</strong> ____</p>" +
      "<p><strong>Suit</strong> ____ <strong>Date of Hearing</strong> ____</p>"

    it("fills each paragraph in place, keeping the label bold and the value plain", () => {
      const selectedText = "In the Court of : ____\n\nCase ____ Versus ____\n\nSuit ____ Date of Hearing ____"
      const answer =
        "<strong>In the Court of :</strong> Delhi High Court\n\n" +
        "<strong>Case</strong> CLR 20/2024 <strong>Versus</strong> Robert Downey Jr.\n\n" +
        "<strong>Suit</strong> Civil Suit <strong>Date of Hearing</strong> 09.09.2026"

      expect(splice(form, selectedText, answer)).toBe(
        "<p><strong>In the Court of :</strong> Delhi High Court</p>" +
          "<p><strong>Case</strong> CLR 20/2024 <strong>Versus</strong> Robert Downey Jr.</p>" +
          "<p><strong>Suit</strong> Civil Suit <strong>Date of Hearing</strong> 09.09.2026</p>",
      )
    })

    it("keeps attributes on the paragraphs it didn't need to touch, like data-page", () => {
      const tagged = "<p data-page=\"1\">one</p><p data-page=\"1\">two</p>"
      const out = splice(tagged, "one\n\ntwo", "ONE\n\nTWO")
      expect(out).toBe('<p data-page="1">ONE</p><p data-page="1">TWO</p>')
    })

    it("still merges the lines when the answer doesn't preserve the breaks, but keeps unchanged words bold", () => {
      const selectedText = "In the Court of : ____\n\nCase ____ Versus ____\n\nSuit ____ Date of Hearing ____"
      const flatAnswer = "In the Court of : Delhi High Court Case CLR 20/2024 Versus Robert Downey Jr."
      // The paragraph breaks are lost -- the model didn't follow the blank-line
      // rule, so there's nothing to reconstruct them from -- but every label
      // untouched by the edit still keeps the bold it already had.
      const out = splice(form, selectedText, flatAnswer)
      expect(out).toContain("<strong>In the Court of :</strong>")
      expect(out).toContain("Delhi High Court")
      expect(out).not.toMatch(/<p>|<\/p>/)
    })
  })
})
