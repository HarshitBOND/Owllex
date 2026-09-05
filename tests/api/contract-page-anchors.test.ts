import { describe, expect, it } from "vitest"
import { pagedMarkdownToHtml } from "@/app/api/lib/html/pagedMarkdownToHtml"
import { sanitizeDocumentHtml } from "@/app/api/lib/html/sanitizeHtml"

describe("pagedMarkdownToHtml", () => {
  it("stamps every top-level block with its page number", () => {
    const html = pagedMarkdownToHtml(["First page para.", "Second page para."])

    expect(html).toContain('data-page="1"')
    expect(html).toContain('data-page="2"')
    expect(html).toContain("First page para.")
    expect(html).toContain("Second page para.")
  })

  it("numbers from one, not zero", () => {
    expect(pagedMarkdownToHtml(["Only page."])).toContain('data-page="1"')
  })

  it("keeps the page number on every block of a multi-block page", () => {
    const html = pagedMarkdownToHtml(["# Heading\n\nBody paragraph."])
    const stamps = html.match(/data-page="1"/g) ?? []
    expect(stamps.length).toBeGreaterThanOrEqual(2)
  })

  it("skips a page that extracted to nothing rather than emitting an empty block", () => {
    const html = pagedMarkdownToHtml(["Real text.", "   ", "More text."])
    expect(html).not.toContain('data-page="2"')
    expect(html).toContain('data-page="3"')
  })

  it("holds no pages harmlessly", () => {
    expect(pagedMarkdownToHtml([])).toBe("")
  })
})

describe("data-page survives sanitisation", () => {
  const paged = pagedMarkdownToHtml(["Clause one.", "Clause two."])

  it("survives the server sanitizer, which every save runs through", () => {
    const clean = sanitizeDocumentHtml(paged)
    expect(clean).toContain('data-page="1"')
    expect(clean).toContain('data-page="2"')
  })

  // The client sanitizer (lib/html/sanitize-draft.ts) shares this allowlist but
  // deliberately returns "" without a `window`, so it fails closed rather than
  // passing raw HTML through. There is nothing meaningful to assert on it here.

  it("still strips what it always stripped", () => {
    const clean = sanitizeDocumentHtml('<p data-page="1" onclick="steal()">Hi</p><script>bad()</script>')
    expect(clean).toContain('data-page="1"')
    expect(clean).not.toContain("onclick")
    expect(clean).not.toContain("<script")
  })
})
