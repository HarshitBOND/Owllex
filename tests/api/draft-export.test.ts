import { describe, expect, it } from "vitest"
import { htmlToBlocks, runsToText } from "@/app/api/lib/export/htmlBlocks"
import { renderPdf } from "@/app/api/lib/export/pdf"
import { renderDocx } from "@/app/api/lib/export/docx"

const SAMPLE = `
<h1 style="text-align: center">RENTAL AGREEMENT</h1>
<p>This deed is made between <strong>the Lessor</strong> and <em>the Lessee</em>.</p>
<h2>1. Term</h2>
<ol><li>Eleven months from <strong>01-04-2026</strong>.</li><li>Renewable by consent.
  <ol><li>Notice of thirty days.</li></ol>
</li></ol>
<ul><li>Deposit refundable</li></ul>
<blockquote><p>Subject to the Transfer of Property Act, 1882.</p></blockquote>
<hr>
<table><thead><tr><th>Head</th><th>Amount</th></tr></thead>
<tbody><tr><td>Rent</td><td>25,000</td></tr></tbody></table>
<p><a href="https://indiacode.nic.in">Bare act</a></p>
`

describe("htmlToBlocks", () => {
  const blocks = htmlToBlocks(SAMPLE)

  it("reads headings with their level and alignment", () => {
    const h1 = blocks.find((b) => b.kind === "heading" && b.level === 1)
    expect(h1).toBeTruthy()
    if (h1?.kind === "heading") {
      expect(runsToText(h1.runs)).toBe("RENTAL AGREEMENT")
      expect(h1.align).toBe("center")
    }
  })

  it("keeps bold and italic as marks on separate runs", () => {
    const p = blocks.find((b) => b.kind === "paragraph")
    if (p?.kind === "paragraph") {
      expect(p.runs.some((r) => r.bold && r.text.includes("Lessor"))).toBe(true)
      expect(p.runs.some((r) => r.italic && r.text.includes("Lessee"))).toBe(true)
    }
  })

  it("numbers ordered list items and nests them by depth", () => {
    const items = blocks.filter((b) => b.kind === "listItem")
    const ordered = items.filter((b) => b.kind === "listItem" && b.ordered)
    expect(ordered.length).toBe(3)
    const nested = ordered.find((b) => b.kind === "listItem" && b.depth === 1)
    expect(nested).toBeTruthy()
    if (nested?.kind === "listItem") expect(runsToText(nested.runs)).toContain("thirty days")
  })

  it("distinguishes bullet lists from ordered ones", () => {
    const bullets = blocks.filter((b) => b.kind === "listItem" && !b.ordered)
    expect(bullets.length).toBe(1)
  })

  it("marks blockquote paragraphs", () => {
    expect(blocks.some((b) => b.kind === "paragraph" && b.quote)).toBe(true)
  })

  it("reads a table with its header row", () => {
    const table = blocks.find((b) => b.kind === "table")
    expect(table).toBeTruthy()
    if (table?.kind === "table") {
      expect(table.rows.length).toBe(2)
      expect(table.rows[0].header).toBe(true)
      expect(runsToText(table.rows[1].cells[1])).toBe("25,000")
    }
  })

  it("keeps hyperlinks on the run", () => {
    const link = blocks
      .flatMap((b) => ("runs" in b ? b.runs : []))
      .find((r) => r.href)
    expect(link?.href).toBe("https://indiacode.nic.in")
  })

  it("keeps text from tags it does not recognise", () => {
    const out = htmlToBlocks("<section><article><p>kept</p></article></section>")
    expect(out.length).toBe(1)
    expect(runsToText(out[0].kind === "paragraph" ? out[0].runs : [])).toBe("kept")
  })

  it("returns nothing for empty input", () => {
    expect(htmlToBlocks("")).toEqual([])
  })
})

describe("renderers", () => {
  const blocks = htmlToBlocks(SAMPLE)
  const options = { title: "Rental Agreement", fontFamily: "Georgia", fontSizePt: 12 }

  it("produces a real PDF", async () => {
    const buf = await renderPdf(blocks, options)
    expect(buf.length).toBeGreaterThan(1000)
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-")
  })

  it("produces a real docx (a zip with word/document.xml)", async () => {
    const buf = await renderDocx(blocks, options)
    expect(buf.length).toBeGreaterThan(1000)
    expect(buf.subarray(0, 2).toString()).toBe("PK")
    expect(buf.toString("latin1")).toContain("word/document.xml")
  })

  it("renders an empty document without throwing", async () => {
    await expect(renderPdf([], options)).resolves.toBeInstanceOf(Buffer)
    await expect(renderDocx([], options)).resolves.toBeDefined()
  })
})
