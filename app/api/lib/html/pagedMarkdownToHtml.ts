import * as cheerio from "cheerio"
import { markdownToHtml } from "./markdownToHtml"

/**
 * Converts an extracted document page by page, stamping every top-level block
 * with the page it came from.
 *
 * Converting the whole document in one pass and then working out offsets
 * afterwards does not survive markdown -> HTML: the conversion reflows lines
 * into paragraphs and merges table rows, so character positions in the source
 * no longer map to anything in the output. Converting each page separately
 * keeps the provenance exact, at the cost of a paragraph split across a page
 * break becoming two paragraphs -- which is what the page break did to it
 * anyway.
 */
export function pagedMarkdownToHtml(pages: string[]): string {
  return pages
    .map((page, index) => {
      // Test the source, not the markup: markdownToHtml("   ") comes back as
      // "<p></p>", which is truthy and would drop a stray empty paragraph into
      // the document for every blank page a scan produced.
      if (!page.trim()) return ""

      const html = markdownToHtml(page)
      if (!html.trim()) return ""

      const $ = cheerio.load(html, null, false)
      $.root()
        .children()
        .each((_, element) => {
          if (!("tagName" in element)) return
          $(element).attr("data-page", String(index + 1))
        })
      return $.html()
    })
    .filter(Boolean)
    .join("\n")
}
