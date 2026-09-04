/**
 * Turns the `[1]` markers the model writes into elements the answer body can
 * render as clickable chips.
 *
 * Written against hast directly rather than pulling in unist-util-visit: the
 * whole job is one recursive walk that replaces text nodes, and the tree we get
 * from remark is small.
 */

type HastNode = {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

const CITATION = /\[(\d{1,2})\]/g

// Markers inside code, or in a link's own label, are not citations.
const OPAQUE = new Set(["code", "pre", "a"])

export type RehypeCitationsOptions = {
  /**
   * Highest source number that actually exists. A `[7]` quoted out of a
   * pleading when the answer only has three sources stays plain text.
   */
  maxN: number
}

export default function rehypeCitations({ maxN }: RehypeCitationsOptions) {
  return (tree: HastNode) => {
    if (maxN < 1) return
    walk(tree, maxN)
  }
}

function walk(node: HastNode, maxN: number) {
  if (!node.children?.length) return
  if (node.tagName && OPAQUE.has(node.tagName)) return

  const next: HastNode[] = []
  for (const child of node.children) {
    if (child.type === "text" && child.value) {
      next.push(...split(child.value, maxN))
      continue
    }
    walk(child, maxN)
    next.push(child)
  }
  node.children = next
}

function split(value: string, maxN: number): HastNode[] {
  CITATION.lastIndex = 0
  if (!CITATION.test(value)) return [{ type: "text", value }]

  const out: HastNode[] = []
  let cursor = 0
  CITATION.lastIndex = 0

  for (let match = CITATION.exec(value); match; match = CITATION.exec(value)) {
    const n = Number(match[1])
    if (n < 1 || n > maxN) continue

    if (match.index > cursor) out.push({ type: "text", value: value.slice(cursor, match.index) })
    out.push({
      type: "element",
      tagName: "cite",
      properties: { dataCitation: String(n) },
      children: [{ type: "text", value: String(n) }],
    })
    cursor = match.index + match[0].length
  }

  if (cursor < value.length) out.push({ type: "text", value: value.slice(cursor) })
  return out.length ? out : [{ type: "text", value }]
}
