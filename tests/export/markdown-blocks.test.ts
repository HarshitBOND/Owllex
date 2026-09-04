import { describe, expect, it } from "vitest"
import { markdownToBlocks } from "@/lib/markdown/markdownToBlocks"

describe("markdownToBlocks", () => {
  it("returns nothing for empty input", () => {
    expect(markdownToBlocks("")).toEqual([])
    expect(markdownToBlocks("   ")).toEqual([])
  })

  it("converts headings and paragraphs", () => {
    const blocks = markdownToBlocks("## Limitation\n\nThe suit is time-barred.")

    expect(blocks[0]).toMatchObject({ kind: "heading", level: 2 })
    expect(blocks[0]).toHaveProperty("runs.0.text", "Limitation")
    expect(blocks[1]).toMatchObject({ kind: "paragraph" })
    expect(blocks[1]).toHaveProperty("runs.0.text", "The suit is time-barred.")
  })

  it("keeps bold runs inside a paragraph", () => {
    const blocks = markdownToBlocks("Article **55** applies.")
    const runs = (blocks[0] as any).runs

    expect(runs.find((r: any) => r.text === "55")?.bold).toBe(true)
  })

  it("converts ordered and unordered lists", () => {
    const blocks = markdownToBlocks("- first\n- second\n\n1. one\n2. two")
    const items = blocks.filter((b) => b.kind === "listItem") as any[]

    expect(items).toHaveLength(4)
    expect(items[0].ordered).toBe(false)
    expect(items[2].ordered).toBe(true)
  })

  it("converts a GFM table", () => {
    const blocks = markdownToBlocks("| Clause | Risk |\n| --- | --- |\n| 7.1 | High |")
    const table = blocks.find((b) => b.kind === "table") as any

    expect(table).toBeTruthy()
    expect(table.rows[0].header).toBe(true)
    expect(table.rows[1].cells[0][0].text).toBe("7.1")
  })

  it("carries citation markers through as text so they still resolve", () => {
    const blocks = markdownToBlocks("The suit is time-barred [1][2].")

    expect((blocks[0] as any).runs.map((r: any) => r.text).join("")).toContain("[1][2]")
  })
})
