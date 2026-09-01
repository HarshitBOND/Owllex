import * as cheerio from "cheerio"
import { textAlignOf } from "@/lib/html/allowlist"

export type Inline = {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  href?: string
}

export type Align = "left" | "center" | "right"

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; align: Align; runs: Inline[] }
  | { kind: "paragraph"; align: Align; runs: Inline[]; quote?: boolean }
  | { kind: "listItem"; ordered: boolean; depth: number; index: number; runs: Inline[] }
  | { kind: "table"; rows: { header: boolean; cells: Inline[][] }[] }
  | { kind: "rule" }

const HEADINGS = new Set(["h1", "h2", "h3"])
const LISTS = new Set(["ul", "ol"])

// cheerio does not re-export its node types, so derive them from the public API.
type Nodes = ReturnType<ReturnType<cheerio.CheerioAPI["root"]>["children"]>
type El = Nodes extends cheerio.Cheerio<infer T> ? T : never

export function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = []
  if (!html || !html.trim()) return blocks

  const $ = cheerio.load(html, null, false)
  walk($, $.root().children(), blocks, 0, false)
  return blocks
}

function walk($: cheerio.CheerioAPI, nodes: Nodes, blocks: Block[], depth: number, quote: boolean) {
  nodes.each((_, el) => {
    if (!("tagName" in el)) return
    const tag = el.tagName.toLowerCase()
    const align = alignOf($, el)

    if (HEADINGS.has(tag)) {
      const runs = runsOf($, el)
      if (runs.length) blocks.push({ kind: "heading", level: Number(tag[1]) as 1 | 2 | 3, align, runs })
      return
    }

    if (tag === "p") {
      const runs = runsOf($, el)
      if (runs.length) blocks.push({ kind: "paragraph", align, runs, quote })
      return
    }

    if (tag === "hr") {
      blocks.push({ kind: "rule" })
      return
    }

    if (tag === "blockquote") {
      walk($, $(el).children(), blocks, depth, true)
      return
    }

    if (LISTS.has(tag)) {
      const ordered = tag === "ol"
      let index = 1
      $(el)
        .children("li")
        .each((__, li) => {
          const runs = runsOf($, li, true)
          if (runs.length) {
            blocks.push({ kind: "listItem", ordered, depth, index, runs })
            index++
          }
          const nested = $(li).children("ul, ol")
          if (nested.length) walk($, nested, blocks, depth + 1, quote)
        })
      return
    }

    if (tag === "table") {
      const rows: { header: boolean; cells: Inline[][] }[] = []
      $(el)
        .find("tr")
        .each((__, tr) => {
          const cells: Inline[][] = []
          let header = false
          $(tr)
            .children("th, td")
            .each((___, cell) => {
              if ((cell as { tagName: string }).tagName.toLowerCase() === "th") header = true
              cells.push(runsOf($, cell))
            })
          if (cells.length) rows.push({ header, cells })
        })
      if (rows.length) blocks.push({ kind: "table", rows })
      return
    }

    // Unknown block wrapper keep its content rather than dropping it.
    const children = $(el).children() as Nodes
    if (children.length) {
      walk($, children, blocks, depth, quote)
    } else {
      const runs = runsOf($, el)
      if (runs.length) blocks.push({ kind: "paragraph", align, runs, quote })
    }
  })
}

function alignOf($: cheerio.CheerioAPI, el: El): Align {
  const value = textAlignOf($(el).attr("style") || "")
  return value === "center" || value === "right" ? value : "left"
}

// skipNestedLists keeps an <li>'s own text separate from its child list items.
function runsOf($: cheerio.CheerioAPI, el: El, skipNestedLists = false): Inline[] {
  const runs: Inline[] = []
  collect($, el, {}, runs, skipNestedLists)

  while (runs.length && !runs[0].text.trim()) runs.shift()
  while (runs.length && !runs[runs.length - 1].text.trim()) runs.pop()
  return runs
}

function collect(
  $: cheerio.CheerioAPI,
  el: El,
  marks: Omit<Inline, "text">,
  out: Inline[],
  skipNestedLists: boolean
) {
  $(el)
    .contents()
    .each((_, child) => {
      if (child.type === "text") {
        const text = child.data.replace(/\s+/g, " ")
        if (text) out.push({ text, ...marks })
        return
      }
      if (!("tagName" in child)) return

      const tag = child.tagName.toLowerCase()
      if (skipNestedLists && LISTS.has(tag)) return

      if (tag === "br") {
        out.push({ text: "\n", ...marks })
        return
      }

      const next = { ...marks }
      if (tag === "strong" || tag === "b") next.bold = true
      if (tag === "em" || tag === "i") next.italic = true
      if (tag === "u") next.underline = true
      if (tag === "s") next.strike = true
      if (tag === "a") next.href = $(child).attr("href") || undefined

      collect($, child, next, out, skipNestedLists)
    })
}

export function runsToText(runs: Inline[]) {
  return runs.map((r) => r.text).join("")
}
