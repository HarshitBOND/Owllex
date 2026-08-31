import { describe, expect, it } from "vitest"
import { htmlToPlainText, sanitizeDocumentHtml } from "@/app/api/lib/html/sanitizeHtml"

describe("sanitizeDocumentHtml", () => {
  it("drops script tags along with their contents", () => {
    const out = sanitizeDocumentHtml("<p>keep</p><script>alert(1)</script>")
    expect(out).toBe("<p>keep</p>")
  })

  it("strips event handler attributes but keeps the element", () => {
    const out = sanitizeDocumentHtml('<p onerror="alert(1)" onclick="x()">hi</p>')
    expect(out).toBe("<p>hi</p>")
  })

  it("unwraps unknown tags instead of deleting their text", () => {
    const out = sanitizeDocumentHtml("<p>a <span class='x'>b</span> c</p>")
    expect(out).toBe("<p>a b c</p>")
  })

  it("unwraps nested unknown tags in a single call", () => {
    const out = sanitizeDocumentHtml("<div><section><p>deep</p></section></div>")
    expect(out).toBe("<p>deep</p>")
  })

  it("keeps text-align and discards every other style declaration", () => {
    const out = sanitizeDocumentHtml('<p style="text-align: center; color: red">x</p>')
    expect(out).toBe('<p style="text-align: center">x</p>')
  })

  it("removes a style attribute with no text-align", () => {
    const out = sanitizeDocumentHtml('<p style="color: red">x</p>')
    expect(out).toBe("<p>x</p>")
  })

  it("rejects javascript: hrefs and keeps http ones", () => {
    expect(sanitizeDocumentHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>")
    expect(sanitizeDocumentHtml('<a href="https://a.test">x</a>')).toBe(
      '<a href="https://a.test" target="_blank" rel="noopener noreferrer">x</a>'
    )
  })

  it("keeps the document tags the drafting prompt promises", () => {
    const html =
      "<h1>T</h1><h2>S</h2><h3>s</h3><p><strong>b</strong><em>i</em><u>u</u></p>" +
      "<ul><li>a</li></ul><ol><li>1</li></ol>" +
      "<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>C</td></tr></tbody></table>"
    expect(sanitizeDocumentHtml(html)).toBe(html)
  })

  it("keeps table cell spans", () => {
    const out = sanitizeDocumentHtml('<table><tr><td colspan="2" rowspan="3">c</td></tr></table>')
    expect(out).toContain('colspan="2"')
    expect(out).toContain('rowspan="3"')
  })

  it("strips an img payload entirely", () => {
    expect(sanitizeDocumentHtml('<p><img src=x onerror=alert(1)></p>')).toBe("<p></p>")
  })

  it("returns empty string for empty input", () => {
    expect(sanitizeDocumentHtml("")).toBe("")
  })
})

describe("htmlToPlainText", () => {
  it("collapses markup and whitespace to a plain string", () => {
    expect(htmlToPlainText("<h1>Title</h1>\n<p>Some  <strong>bold</strong> text</p>")).toBe(
      "Title Some bold text"
    )
  })
})
