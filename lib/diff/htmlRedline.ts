import * as cheerio from "cheerio"
import { diffArrays, diffWords } from "diff"

/**
 * Word-level tracked-changes redline between two versions of a document.
 *
 * Output is display-only HTML: <del> for what went, <ins> for what arrived.
 * Neither tag is in lib/html/allowlist.ts and that is deliberate -- the redline
 * must never reach contentHtml, an export, or the editor's document model. It
 * exists to be read and then thrown away.
 */

/** Block-level tags the document format actually uses (see lib/html/allowlist.ts). */
const BLOCK_TAGS = new Set(["h1", "h2", "h3", "p", "ul", "ol", "blockquote", "table", "hr"])

interface Block {
  /** Serialised element, used verbatim when the block is unchanged. */
  html: string
  /** Flattened text, which is what the diff actually compares. */
  text: string
  tag: string
}

function toBlocks(html: string): Block[] {
  const $ = cheerio.load(html, null, false)
  const blocks: Block[] = []

  $.root()
    .children()
    .each((_, element) => {
      if (!("tagName" in element)) return
      const tag = element.tagName.toLowerCase()
      const $el = $(element)
      blocks.push({
        html: $.html($el),
        text: $el.text().replace(/\s+/g, " ").trim(),
        tag: BLOCK_TAGS.has(tag) ? tag : "p",
      })
    })

  return blocks
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * Word diff of two plain strings, as <del>/<ins> runs.
 *
 * Diffing the *text* and re-emitting rather than diffing the markup: a word
 * diff run over raw HTML splits tags down the middle the moment a change lands
 * on a boundary, and the result is unparseable. The cost is that inline
 * formatting inside a changed block is dropped, which is worth it for a view
 * whose whole job is showing which words moved.
 */
function diffText(before: string, after: string) {
  return diffWords(before, after)
    .map((part) => {
      const text = escapeHtml(part.value)
      if (part.added) return `<ins>${text}</ins>`
      if (part.removed) return `<del>${text}</del>`
      return text
    })
    .join("")
}

/**
 * Closes tags left dangling by a partial stream.
 *
 * A revision arrives token by token, so every intermediate frame ends mid-tag
 * or mid-element. cheerio would either drop the trailing fragment or nest the
 * rest of the document inside it, and the redline would thrash on every chunk.
 */
export function closeOpenTags(partial: string) {
  // Drop a trailing half-written tag ("<stro", "<p cla") outright -- there is
  // nothing meaningful to render from it yet.
  let html = partial.replace(/<[^>]*$/, "")

  const voidTags = new Set(["br", "hr", "img", "input"])
  const open: string[] = []
  const tagPattern = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)[^>]*?(\/?)>/g

  for (let match = tagPattern.exec(html); match; match = tagPattern.exec(html)) {
    const [, closing, rawName, selfClosing] = match
    const name = rawName.toLowerCase()
    if (voidTags.has(name) || selfClosing) continue

    if (closing) {
      const index = open.lastIndexOf(name)
      if (index !== -1) open.splice(index, 1)
    } else {
      open.push(name)
    }
  }

  for (let i = open.length - 1; i >= 0; i--) {
    html += `</${open[i]}>`
  }
  return html
}

/**
 * Builds the redline of `after` against `before`.
 *
 * Two passes: pair the blocks up by text so whole added and removed paragraphs
 * are recognised as such, then word-diff only the pairs that actually differ.
 * Doing it in one flat word diff across the document would report a moved
 * paragraph as a large deletion next to a large insertion, which reads as far
 * more churn than really happened.
 */
export function buildRedline(before: string, after: string): string {
  const beforeBlocks = toBlocks(before)
  const afterBlocks = toBlocks(after)

  const changes = diffArrays(
    beforeBlocks.map((block) => block.text),
    afterBlocks.map((block) => block.text),
  )

  const out: string[] = []
  let beforeIndex = 0
  let afterIndex = 0

  // diffArrays reports a modified block as a removal immediately followed by an
  // addition. Pairing those back up is what turns "paragraph replaced" into a
  // readable word-level diff instead of two whole-paragraph blocks.
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    const next = changes[i + 1]

    if (!change.added && !change.removed) {
      for (let n = 0; n < change.count!; n++) out.push(afterBlocks[afterIndex + n].html)
      beforeIndex += change.count!
      afterIndex += change.count!
      continue
    }

    if (change.removed && next?.added) {
      const pairs = Math.min(change.count!, next.count!)
      for (let n = 0; n < pairs; n++) {
        const from = beforeBlocks[beforeIndex + n]
        const to = afterBlocks[afterIndex + n]
        out.push(`<${to.tag}>${diffText(from.text, to.text)}</${to.tag}>`)
      }
      // Whatever is left over on either side is a genuine add or delete.
      for (let n = pairs; n < change.count!; n++) {
        const block = beforeBlocks[beforeIndex + n]
        out.push(`<${block.tag}><del>${escapeHtml(block.text)}</del></${block.tag}>`)
      }
      for (let n = pairs; n < next.count!; n++) {
        const block = afterBlocks[afterIndex + n]
        out.push(`<${block.tag}><ins>${escapeHtml(block.text)}</ins></${block.tag}>`)
      }
      beforeIndex += change.count!
      afterIndex += next.count!
      i++
      continue
    }

    if (change.removed) {
      for (let n = 0; n < change.count!; n++) {
        const block = beforeBlocks[beforeIndex + n]
        out.push(`<${block.tag}><del>${escapeHtml(block.text)}</del></${block.tag}>`)
      }
      beforeIndex += change.count!
      continue
    }

    for (let n = 0; n < change.count!; n++) {
      const block = afterBlocks[afterIndex + n]
      out.push(`<${block.tag}><ins>${escapeHtml(block.text)}</ins></${block.tag}>`)
    }
    afterIndex += change.count!
  }

  return out.join("\n")
}
