import type { TemplateField } from "./fields"

/**
 * Cheap structural comparison between two templates, used to shortlist
 * duplicate candidates before spending a model call on them.
 *
 * Batch import makes near-duplicates inevitable -- the same court form under a
 * different filename, or a revised edition of one already published. Comparing
 * everything against everything with a language model would be slow and
 * expensive, so these functions do the coarse work first and only close
 * candidates go to the model for a verdict.
 *
 * Deliberately dependency-free and regex-based rather than cheerio, so the same
 * numbers can be computed on either side of the wire and asserted in tests.
 */

/** Tags out, entities decoded, whitespace collapsed -- what a reader actually sees. */
export function plainTextOf(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
}

/** One line per block-level element, which is what makes a diff readable. */
export function textLinesOf(html: string): string[] {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|h1|h2|h3|li|tr|blockquote|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").replace(/\s*\|\s*$/, "").trim())
    .filter(Boolean)
}

/**
 * Tokens for similarity. Token placeholders are stripped first: two editions of
 * the same form should not look different merely because a blank was renamed
 * from {{court}} to {{court_name}}.
 */
function tokensOf(html: string): string[] {
  return plainTextOf(html)
    .replace(/\{\{[^}]*\}\}/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9ऀ-෿\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
}

/** Jaccard overlap of two sets, 0..1. */
export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const setA = new Set(a)
  const setB = new Set(b)
  if (setA.size === 0 && setB.size === 0) return 1
  let shared = 0
  for (const item of setA) if (setB.has(item)) shared++
  const union = setA.size + setB.size - shared
  return union === 0 ? 0 : shared / union
}

/**
 * Bag-of-words similarity that accounts for repetition, so a form is not judged
 * identical to one that merely reuses the same vocabulary.
 */
export function textSimilarity(htmlA: string, htmlB: string): number {
  const a = tokensOf(htmlA)
  const b = tokensOf(htmlB)
  if (a.length === 0 && b.length === 0) return 1
  if (a.length === 0 || b.length === 0) return 0

  const countsA = new Map<string, number>()
  for (const token of a) countsA.set(token, (countsA.get(token) ?? 0) + 1)

  let shared = 0
  for (const token of b) {
    const remaining = countsA.get(token) ?? 0
    if (remaining > 0) {
      shared++
      countsA.set(token, remaining - 1)
    }
  }

  // Dice coefficient: shared appears in both bags, so it counts twice.
  return (2 * shared) / (a.length + b.length)
}

export function fieldKeyOverlap(a: TemplateField[], b: TemplateField[]) {
  const keysA = a.map((f) => f.key)
  const keysB = b.map((f) => f.key)
  const setB = new Set(keysB)
  const shared = keysA.filter((k) => setB.has(k))
  return {
    shared: shared.length,
    total: new Set([...keysA, ...keysB]).size,
    ratio: jaccard(keysA, keysB),
    onlyInA: keysA.filter((k) => !setB.has(k)),
    onlyInB: keysB.filter((k) => !new Set(keysA).has(k)),
  }
}

export type DiffLine = { type: "same" | "add" | "remove"; text: string }

/**
 * Line diff by longest common subsequence.
 *
 * Court forms run to a few dozen lines, so the quadratic table is nothing, and
 * an LCS diff shows a reviewer the one changed clause instead of colouring the
 * whole document as different the way a naive positional compare would.
 */
export function diffLines(fromHtml: string, toHtml: string, maxLines = 400): DiffLine[] {
  const from = textLinesOf(fromHtml).slice(0, maxLines)
  const to = textLinesOf(toHtml).slice(0, maxLines)

  const n = from.length
  const m = to.length
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        from[i] === to[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (from[i] === to[j]) {
      out.push({ type: "same", text: from[i] })
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ type: "remove", text: from[i] })
      i++
    } else {
      out.push({ type: "add", text: to[j] })
      j++
    }
  }
  while (i < n) out.push({ type: "remove", text: from[i++] })
  while (j < m) out.push({ type: "add", text: to[j++] })

  return out
}
