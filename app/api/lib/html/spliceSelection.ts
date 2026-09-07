/**
 * Replaces a selected passage inside a stored HTML document.
 *
 * The two sides of this never speak the same language. The editor reports a
 * selection as plain text -- `textBetween` over ProseMirror positions, with
 * every tag gone, runs of whitespace collapsed, and no separator at all across
 * a <br> -- while the server holds the markup it was parsed from. So the
 * passage "Place: Delhi High Court" is genuinely absent from
 * `<p><strong>Place:</strong> Delhi High Court</p>` as far as `indexOf` is
 * concerned, and a plain substring search fails on essentially every selection
 * that touches formatting or crosses a paragraph. That is not the document
 * moving under us, which is what such a failure gets reported as.
 *
 * So the search runs over a flattened view of the document -- tags reduced to a
 * whitespace marker, entities decoded -- carrying an index map back to the
 * original string, and the splice happens at the mapped offsets.
 *
 * A model answering with plain text has no way to say a word it left alone
 * was bold -- so any word in its answer that matches the original word for
 * word gets that formatting back before the splice happens (reformatUnchangedRuns),
 * rather than the whole passage quietly losing whatever emphasis it had.
 */

import { diffWords } from "diff"

/** Single-character entities worth decoding; "&" is the one that shows up in party names. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

function decodeEntity(body: string) {
  if (body.startsWith("#")) {
    const code =
      body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
    // Kept to the basic plane so one entity is always one character, which is
    // what lets the index map stay one-to-one.
    return Number.isInteger(code) && code > 0 && code <= 0xffff ? String.fromCharCode(code) : null
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? null
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

interface Flattened {
  /** The document as text: one "\n" per tag, entities decoded. */
  text: string
  /** For each character, where it starts and ends in the original HTML. */
  starts: number[]
  ends: number[]
}

/**
 * Every tag becomes exactly one newline rather than disappearing.
 *
 * Dropping tags outright would weld "…Court</p><p>Date…" into "CourtDate" and
 * invent an adjacency the editor never reported; as whitespace it instead
 * matches the space `textBetween` puts between blocks, and is skippable where
 * `textBetween` put nothing (a <br>, or a <strong> mid-sentence).
 */
function flatten(html: string): Flattened {
  const chars: string[] = []
  const starts: number[] = []
  const ends: number[] = []

  let i = 0
  while (i < html.length) {
    const char = html[i]

    if (char === "<") {
      const close = html.indexOf(">", i)
      const end = close === -1 ? html.length : close + 1
      chars.push("\n")
      starts.push(i)
      ends.push(end)
      i = end
      continue
    }

    if (char === "&") {
      const semicolon = html.indexOf(";", i)
      // Longest real entity here is "&#x2014;"; anything longer is a stray "&".
      if (semicolon !== -1 && semicolon - i <= 8) {
        const decoded = decodeEntity(html.slice(i + 1, semicolon))
        if (decoded) {
          chars.push(decoded)
          starts.push(i)
          ends.push(semicolon + 1)
          i = semicolon + 1
          continue
        }
      }
    }

    chars.push(char)
    starts.push(i)
    ends.push(i + 1)
    i++
  }

  return { text: chars.join(""), starts, ends }
}

interface Hit {
  index: number
  length: number
}

/**
 * The words of the passage, in order, with anything whitespace-ish allowed
 * between them -- which after flattening includes the tags.
 */
function matchWords(text: string, selectedText: string): Hit | null {
  const words = selectedText.split(/\s+/).filter(Boolean)
  if (words.length === 0) return null

  const match = new RegExp(words.map(escapeRegExp).join("\\s+")).exec(text)
  return match ? { index: match.index, length: match[0].length } : null
}

/** Selections long enough that the word pass is certain to have decided it already. */
const LOOSE_LIMIT = 4000

/**
 * Last resort: the same characters in the same order, ignoring whitespace
 * entirely.
 *
 * This is what catches a selection across a <br>, where `textBetween` reports
 * "Delhi" and "Date:" run together with nothing between them but the markup has
 * a tag there. The span it matches is capped, so scattered characters can never
 * swallow half the document.
 */
function matchLoosely(text: string, selectedText: string): Hit | null {
  const chars = selectedText.replace(/\s+/g, "")
  if (!chars || chars.length > LOOSE_LIMIT) return null

  const match = new RegExp([...chars].map(escapeRegExp).join("\\s*")).exec(text)
  if (!match) return null

  const stretched = match[0].length > chars.length * 3 + 50
  return stretched ? null : { index: match.index, length: match[0].length }
}

const BLOCK_REPLACEMENT = /^\s*<(?:p|h[1-6]|ul|ol|blockquote|table|hr)\b/i
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^<>]*)>/g
const VOID_TAGS = new Set(["br", "hr", "img", "input", "col", "source"])

/**
 * Tags in the cut that have no partner inside it: elements the passage began
 * part way into, and elements it stopped part way through.
 */
function danglingTags(slice: string) {
  const opened: { name: string; tag: string }[] = []
  const closed: string[] = []

  for (const match of slice.matchAll(TAG)) {
    const [tag, closing, rawName, rest] = match
    const name = rawName.toLowerCase()
    if (VOID_TAGS.has(name) || rest.trimEnd().endsWith("/")) continue

    if (closing) {
      const index = opened.map((entry) => entry.name).lastIndexOf(name)
      if (index === -1) closed.push(name)
      else opened.splice(index, 1)
    } else {
      opened.push({ name, tag })
    }
  }

  return { opened, closed }
}

const INLINE_TAGS = new Set(["strong", "em", "u", "s"])

/** Which of strong/em/u/s are open at a position, scanning the document from its start. */
function activeInlineTagsBefore(html: string, pos: number) {
  let stack: string[] = []
  for (const match of html.slice(0, pos).matchAll(TAG)) {
    const [, closing, rawName, rest] = match
    const name = rawName.toLowerCase()
    if (!INLINE_TAGS.has(name) || rest.trimEnd().endsWith("/")) continue
    if (closing) {
      const index = stack.lastIndexOf(name)
      if (index !== -1) stack = [...stack.slice(0, index), ...stack.slice(index + 1)]
    } else {
      stack = [...stack, name]
    }
  }
  return stack
}

/** The plain text of html[from, to), alongside the strong/em/u/s tags active over each character. */
function extractFormattedText(html: string, from: number, to: number) {
  const text: string[] = []
  const tags: string[][] = []
  let stack = activeInlineTagsBefore(html, from)

  let i = from
  while (i < to) {
    const char = html[i]

    if (char === "<") {
      const close = html.indexOf(">", i)
      const end = close === -1 ? to : Math.min(close + 1, to)
      const match = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(html.slice(i, end))
      if (match) {
        const [, closing, rawName] = match
        const name = rawName.toLowerCase()
        if (INLINE_TAGS.has(name)) {
          if (closing) {
            const index = stack.lastIndexOf(name)
            if (index !== -1) stack = [...stack.slice(0, index), ...stack.slice(index + 1)]
          } else {
            stack = [...stack, name]
          }
        }
      }
      i = end
      continue
    }

    if (char === "&") {
      const semicolon = html.indexOf(";", i)
      if (semicolon !== -1 && semicolon < to && semicolon - i <= 8) {
        const decoded = decodeEntity(html.slice(i + 1, semicolon))
        if (decoded) {
          text.push(decoded)
          tags.push(stack)
          i = semicolon + 1
          continue
        }
      }
    }

    text.push(char)
    tags.push(stack)
    i++
  }

  return { text: text.join(""), tags }
}

function sameTags(a: string[], b: string[]) {
  return a.length === b.length && a.every((name, index) => name === b[index])
}

/**
 * Restores the original bold/italic/underline/strike on every word of a
 * plain-text answer that matches the original word for word.
 *
 * REVISION_RULES asks for plain text back, which means a label like "Case"
 * or "In the Court of :" that the instruction never touched has no way to
 * arrive still bold -- plain text cannot say that. So instead of trusting
 * the model to reproduce formatting it was told not to use, every word in
 * the answer that is identical to the corresponding original word keeps
 * whatever formatting that word already had; a genuinely new or changed
 * word (the value filled into a blank) is left exactly as the model wrote
 * it, unformatted.
 *
 * A no-op the instant the answer already carries its own markup -- that
 * answer is trusted as-is, same as everywhere else in this file.
 */
function reformatUnchangedRuns(html: string, from: number, to: number, replacement: string) {
  if (/<[a-zA-Z]/.test(replacement)) return replacement

  const { text: originalText, tags: originalTags } = extractFormattedText(html, from, to)
  if (!originalTags.some((run) => run.length > 0)) return replacement

  let out = ""
  let cursor = 0
  let openTags: string[] = []

  const setTags = (wanted: string[]) => {
    if (sameTags(openTags, wanted)) return
    for (let i = openTags.length - 1; i >= 0; i--) out += `</${openTags[i]}>`
    for (const name of wanted) out += `<${name}>`
    openTags = wanted
  }

  for (const part of diffWords(originalText, replacement)) {
    if (part.removed) {
      cursor += part.value.length
      continue
    }
    if (part.added) {
      setTags([])
      out += part.value
      continue
    }
    for (const char of part.value) {
      setTags(originalTags[cursor] ?? [])
      out += char
      cursor++
    }
  }
  setTags([])
  return out
}

/**
 * Widens the cut over a block the passage filled from end to end.
 *
 * Selecting a whole paragraph and getting `<p>` back from the model would
 * otherwise write `<p><p>revised</p></p>`, which the parser untangles into a
 * pair of empty paragraphs around the real one.
 */
function widenOverWrapper(html: string, from: number, to: number) {
  for (let pass = 0; pass < 10; pass++) {
    const open = /<([a-zA-Z][a-zA-Z0-9]*)[^<>]*>\s*$/.exec(html.slice(0, from))
    if (!open) break

    const closer = new RegExp(`^\\s*</${open[1]}\\s*>`, "i").exec(html.slice(to))
    if (!closer) break

    from = open.index
    to += closer[0].length
  }
  return { from, to }
}

/**
 * Widens the cut over an element it consumed the whole contents of.
 *
 * This is what turns `<strong>Place:</strong> Delhi High Court` into a clean
 * replacement rather than one wearing the bold of a label that is no longer
 * there.
 */
function widen(html: string, from: number, to: number) {
  for (let pass = 0; pass < 10; pass++) {
    const { opened, closed } = danglingTags(html.slice(from, to))

    const openBefore = closed.length > 0 ? /<([a-zA-Z][a-zA-Z0-9]*)[^<>]*>\s*$/.exec(html.slice(0, from)) : null
    if (openBefore && openBefore[1].toLowerCase() === closed[0]) {
      from = openBefore.index
      continue
    }

    const last = opened[opened.length - 1]
    const closeAfter = last ? new RegExp(`^\\s*</${last.name}\\s*>`, "i").exec(html.slice(to)) : null
    if (closeAfter) {
      to += closeAfter[0].length
      continue
    }

    return { from, to }
  }
  return { from, to }
}

/** Where a selection lands in the raw HTML, before any widening. */
function locate(contentHtml: string, selectedText: string): { from: number; to: number } | null {
  const flat = flatten(contentHtml)
  const hit = matchWords(flat.text, selectedText) ?? matchLoosely(flat.text, selectedText)
  if (!hit) return null
  return { from: flat.starts[hit.index], to: flat.ends[hit.index + hit.length - 1] }
}

/** Where one original block ends and the next begins, inside a cut that spans more than one. */
const BLOCK_BOUNDARY = /<\/(?:p|h[1-6]|li|blockquote)>\s*<(?:p|h[1-6]|li|blockquote)\b[^<>]*>/gi

function findBlockBoundaries(html: string, from: number, to: number) {
  const boundaries: { start: number; end: number }[] = []
  for (const match of html.slice(from, to).matchAll(BLOCK_BOUNDARY)) {
    boundaries.push({ start: from + match.index, end: from + match.index + match[0].length })
  }
  return boundaries
}

/**
 * The dangling-tag close/reopen spliceSelection applies to a whole cut,
 * scoped to one sub-range of it.
 *
 * Unlike the whole-cut version, the text going back in here can carry its own
 * markup (a segment answering "the label stays bold" reopens `<strong>`
 * itself) -- so a tag the document already had open at `from` that the
 * segment reopens right away is left alone rather than force-closed into an
 * empty pair the segment's own tag then duplicates.
 */
function fixDangling(html: string, from: number, to: number, text: string) {
  const { opened, closed } = danglingTags(html.slice(from, to))

  let body = text
  const closeParts: string[] = []
  for (const name of closed) {
    const reopensImmediately = new RegExp(`^<${name}(?:\\s[^<>]*)?>`, "i")
    if (reopensImmediately.test(body)) {
      body = body.replace(reopensImmediately, "")
    } else {
      closeParts.push(`</${name}>`)
    }
  }

  const reopen = opened.map((entry) => entry.tag).join("")
  return closeParts.join("") + body + reopen
}

/**
 * Drops a flat, blank-line-separated answer back across the paragraphs a
 * selection spanned, instead of paving over the breaks between them.
 *
 * The selection a selection-scoped revision is built from joins separate
 * paragraphs with a blank line (see getEditorSelection), and the model is
 * asked to answer on the same terms -- so a passage that crossed three
 * paragraphs comes back as three blank-line-separated segments, in order.
 * Each one is spliced into its own original paragraph, keeping that
 * paragraph's own tag and attributes (data-page in particular) exactly as
 * they were rather than trusting the model to rebuild them from scratch.
 *
 * Only engages once the shapes actually match -- same number of segments as
 * there were breaks, none of them blank. A model that ignored the breaks
 * (or one that answered with its own block markup, handled upstream by
 * widenOverWrapper) falls through to the ordinary single-cut splice instead
 * of being forced into a reconstruction that doesn't fit.
 */
function spliceAcrossParagraphs(html: string, from: number, to: number, replacement: string) {
  const boundaries = findBlockBoundaries(html, from, to)
  if (boundaries.length === 0) return null

  const segments = replacement.split(/\n{2,}/)
  if (segments.length !== boundaries.length + 1) return null
  if (segments.some((segment) => !segment.trim())) return null

  let cursor = from
  let out = html.slice(0, from)
  for (let i = 0; i < boundaries.length; i++) {
    const segment = reformatUnchangedRuns(html, cursor, boundaries[i].start, segments[i].trim())
    out += fixDangling(html, cursor, boundaries[i].start, segment)
    out += html.slice(boundaries[i].start, boundaries[i].end)
    cursor = boundaries[i].end
  }
  const lastSegment = reformatUnchangedRuns(html, cursor, to, segments[segments.length - 1].trim())
  out += fixDangling(html, cursor, to, lastSegment)
  out += html.slice(to)
  return out
}

/**
 * A cut that includes a `<td>`/`<th>`/`<tr>` boundary needs its own cell
 * wrapper around whatever replaces it to stay valid table markup -- but the
 * model was only ever asked for plain replacement text, on the same terms as
 * the selection it was given, never a wrapper for a tag it was never told
 * about. Splicing anyway merges the sibling cells the cut touched into one,
 * and leaves the replacement as a stray text node inside <tr>: not a cell,
 * so browsers relocate it out of the table entirely on parse. Detecting this
 * up front lets the caller refuse the edit instead of quietly wrecking the
 * table.
 */
const TABLE_STRUCTURE_TAG = /<\/?(?:td|th|tr)\b/i

export function selectionCrossesTableBoundary(contentHtml: string, selectedText: string): boolean {
  if (contentHtml.indexOf(selectedText) !== -1) return false
  const span = locate(contentHtml, selectedText)
  return span !== null && TABLE_STRUCTURE_TAG.test(contentHtml.slice(span.from, span.to))
}

export function spliceSelection(contentHtml: string, selectedText: string, replacement: string) {
  const exact = contentHtml.indexOf(selectedText)
  if (exact !== -1) {
    return contentHtml.slice(0, exact) + replacement + contentHtml.slice(exact + selectedText.length)
  }

  const span = locate(contentHtml, selectedText)
  if (!span) return null
  let { from, to } = span
  if (TABLE_STRUCTURE_TAG.test(contentHtml.slice(from, to))) return null

  // A flat answer to a passage that crossed paragraph breaks gets spliced back
  // into each of those paragraphs rather than paving over the breaks between
  // them -- see spliceAcrossParagraphs. This runs on the un-widened span: it
  // needs to see each paragraph's own tag intact to keep it, which is exactly
  // what widen() below would otherwise consume. Only tried for a plain-text
  // answer; one that already brought its own block markup is handled next.
  if (!BLOCK_REPLACEMENT.test(replacement)) {
    const reconstructed = spliceAcrossParagraphs(contentHtml, from, to, replacement)
    if (reconstructed !== null) return reconstructed
  }

  // A passage that covered a whole paragraph takes the paragraph with it, but
  // only when the model answered with a block of its own to stand in its place.
  if (BLOCK_REPLACEMENT.test(replacement)) {
    ;({ from, to } = widenOverWrapper(contentHtml, from, to))
  }
  ;({ from, to } = widen(contentHtml, from, to))

  // Whatever imbalance is left is an element the cut genuinely divided: the
  // bold run that ended inside the passage is closed before the replacement,
  // and the italic that carries on past it is reopened after, so neither
  // spreads over text that was never formatted that way. reformatUnchangedRuns
  // runs first so a word the cut fully contained -- a label like "Case" that
  // was bold start to finish -- gets that formatting back too, not just the
  // words dangling across the edges.
  const formatted = reformatUnchangedRuns(contentHtml, from, to, replacement)
  return contentHtml.slice(0, from) + fixDangling(contentHtml, from, to, formatted) + contentHtml.slice(to)
}
