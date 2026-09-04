import { marked } from "marked"
import { htmlToBlocks, type Block } from "@/app/api/lib/export/htmlBlocks"

/**
 * Markdown -> the export pipeline's block representation, by way of the HTML
 * converter the contract-review export already uses. The assistant answers in
 * markdown; renderPdf and renderDocx take blocks; htmlToBlocks already handles
 * every element the house style permits (headings, paragraphs, lists, tables,
 * rules), so the shortest correct path is to reuse it rather than write a
 * second tree walker.
 */
export function markdownToBlocks(markdown: string): Block[] {
  if (!markdown?.trim()) return []
  const html = marked.parse(markdown, { async: false, gfm: true, breaks: false }) as string
  return htmlToBlocks(html)
}
