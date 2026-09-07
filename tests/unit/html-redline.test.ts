import { describe, expect, it } from "vitest"
import { buildInlineRedline, buildRedline, closeOpenTags } from "@/lib/diff/htmlRedline"

describe("closeOpenTags", () => {
  it("closes what a partial stream left open", () => {
    expect(closeOpenTags("<p>Hello")).toBe("<p>Hello</p>")
    expect(closeOpenTags("<ul><li>One</li><li>Two")).toBe("<ul><li>One</li><li>Two</li></ul>")
  })

  it("drops a half-written tag rather than rendering it as text", () => {
    expect(closeOpenTags("<p>Hello</p><stro")).toBe("<p>Hello</p>")
    expect(closeOpenTags("<p>Hi</p><p cla")).toBe("<p>Hi</p>")
  })

  it("leaves void and self-closing tags alone", () => {
    expect(closeOpenTags("<p>One<br>Two</p>")).toBe("<p>One<br>Two</p>")
    expect(closeOpenTags("<hr/>")).toBe("<hr/>")
  })

  it("is a no-op on already balanced HTML", () => {
    const html = "<h1>Title</h1><p>Body</p>"
    expect(closeOpenTags(html)).toBe(html)
  })
})

describe("buildRedline", () => {
  it("marks a changed word without touching the rest of the sentence", () => {
    const out = buildRedline("<p>The term is five years.</p>", "<p>The term is three years.</p>")
    expect(out).toContain("<del>five</del>")
    expect(out).toContain("<ins>three</ins>")
    expect(out).toContain("The term is")
    expect(out).not.toContain("<del>The term is</del>")
  })

  it("marks a whole added paragraph as an insertion", () => {
    const out = buildRedline("<p>One.</p>", "<p>One.</p><p>Two.</p>")
    expect(out).toContain("<ins>Two.</ins>")
    expect(out).not.toContain("<del>")
  })

  it("marks a whole removed paragraph as a deletion", () => {
    const out = buildRedline("<p>One.</p><p>Two.</p>", "<p>One.</p>")
    expect(out).toContain("<del>Two.</del>")
    expect(out).not.toContain("<ins>")
  })

  it("leaves an unchanged document with no markers at all", () => {
    const html = "<h1>Agreement</h1><p>Clause one.</p>"
    const out = buildRedline(html, html)
    expect(out).not.toContain("<del>")
    expect(out).not.toContain("<ins>")
  })

  it("reports a reorder as one move, not a rewrite of both paragraphs", () => {
    const out = buildRedline("<p>Alpha.</p><p>Beta.</p>", "<p>Beta.</p><p>Alpha.</p>")
    // One of the two is relocated; the other must survive untouched.
    const marked = (out.match(/<(del|ins)>/g) ?? []).length
    expect(marked).toBeLessThanOrEqual(2)
  })

  it("preserves the heading level of a changed block", () => {
    const out = buildRedline("<h2>Indemnity</h2>", "<h2>Mutual indemnity</h2>")
    expect(out).toMatch(/^<h2>/)
    expect(out).toContain("<ins>")
  })

  it("escapes markup that came from the document text", () => {
    const out = buildRedline("<p>a &lt; b</p>", "<p>a &gt; b</p>")
    expect(out).not.toContain("<script")
    expect(out).toContain("&lt;")
  })

  it("handles a mid-stream partial once it has been closed", () => {
    const before = "<p>The term is five years.</p>"
    const partial = closeOpenTags("<p>The term is three ye")
    const out = buildRedline(before, partial)
    expect(out).toContain("<del>")
    expect(out).toContain("<ins>")
  })

  it("numbers a changed paragraph once, not once per word-level run", () => {
    const out = buildRedline(
      "<p>The term is five years and rent is one hundred dollars.</p>",
      "<p>The term is three years and rent is two hundred dollars.</p>",
    )
    const markers = out.match(/<sup class="redline-marker/g) ?? []
    // Two separate word-level edits inside the same paragraph still share
    // one reference number -- otherwise a lightly-edited paragraph reads
    // as if it had several distinct changes.
    expect(markers.length).toBe(1)
    expect(out).toContain('redline-marker--mixed">1<')
  })

  it("numbers a pure deletion and a pure insertion independently", () => {
    const removed = buildRedline("<p>One.</p><p>Two.</p>", "<p>One.</p>")
    expect(removed).toContain('redline-marker--del">1<')
    expect(removed).not.toContain("redline-marker--ins")

    const added = buildRedline("<p>One.</p>", "<p>One.</p><p>Two.</p>")
    expect(added).toContain('redline-marker--ins">1<')
    expect(added).not.toContain("redline-marker--del")
  })

  it("does not number an unchanged document", () => {
    const html = "<h1>Agreement</h1><p>Clause one.</p>"
    expect(buildRedline(html, html)).not.toContain("redline-marker")
  })
})

describe("buildInlineRedline", () => {
  it("marks the changed words in an inline run with no block wrapper", () => {
    const out = buildInlineRedline("the rent is five thousand rupees", "the rent is ten thousand rupees")
    expect(out).toContain("<del>five</del>")
    expect(out).toContain("<ins>ten</ins>")
    expect(out).not.toMatch(/^<p>/)
  })

  it("strips markup from an answer that came back as HTML", () => {
    const out = buildInlineRedline("five years", "<p>three years</p>")
    expect(out).toContain("<del>five</del>")
    expect(out).toContain("<ins>three</ins>")
    expect(out).not.toContain("<p>")
  })

  it("copes with an unclosed mid-stream fragment once it has been closed", () => {
    const partial = closeOpenTags("<strong>ten thousand ru")
    const out = buildInlineRedline("five thousand rupees", partial)
    expect(out).toContain("<ins>")
  })

  it("has nothing to mark when the passage is unchanged", () => {
    const out = buildInlineRedline("five years", "five years")
    expect(out).not.toContain("<del>")
    expect(out).not.toContain("<ins>")
  })
})
