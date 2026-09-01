import PDFDocument from "pdfkit"
import type { Block, Inline } from "./htmlBlocks"

// Standard-14 AFM fonts only. Registering a TTF is the classic pdfkit-on-serverless
// failure, and the invoice route already proves this set resolves here.
const SERIF = { normal: "Times-Roman", bold: "Times-Bold", italic: "Times-Italic", boldItalic: "Times-BoldItalic" }
const SANS = { normal: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique", boldItalic: "Helvetica-BoldOblique" }

const fontFor = (family: string) => (/arial|helvetica|inter|sans/i.test(family) ? SANS : SERIF)

const pick = (set: typeof SERIF, run: Inline) =>
  run.bold && run.italic ? set.boldItalic : run.bold ? set.bold : run.italic ? set.italic : set.normal

export function renderPdf(
  blocks: Block[],
  options: { title: string; fontFamily: string; fontSizePt: number }
) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 64, bottom: 64, left: 64, right: 64 },
      bufferPages: true,
      info: { Title: options.title },
    })

    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    const set = fontFor(options.fontFamily)
    const base = options.fontSizePt
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right

    const writeRuns = (runs: Inline[], size: number, opts: PDFKit.Mixins.TextOptions) => {
      runs.forEach((run, i) => {
        doc
          .font(pick(set, run))
          .fontSize(size)
          .fillColor("#000")
          .text(run.text, {
            ...opts,
            continued: i < runs.length - 1,
            underline: run.underline,
            strike: run.strike,
            link: run.href,
          })
      })
      if (runs.length === 0) doc.moveDown(0.5)
    }

    for (const block of blocks) {
      if (block.kind === "rule") {
        doc.moveDown(0.4)
        doc
          .moveTo(doc.page.margins.left, doc.y)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y)
          .strokeColor("#cccccc")
          .stroke()
        doc.moveDown(0.6)
        continue
      }

      if (block.kind === "heading") {
        const size = block.level === 1 ? base + 5 : block.level === 2 ? base + 2 : base + 0.5
        doc.moveDown(block.level === 1 ? 0.4 : 0.6)
        writeRuns(
          block.runs.map((r) => ({ ...r, bold: true })),
          size,
          { align: block.level === 1 ? "center" : block.align }
        )
        doc.moveDown(0.4)
        continue
      }

      if (block.kind === "paragraph") {
        writeRuns(block.runs, base, {
          align: block.align,
          lineGap: 3,
          indent: block.quote ? 24 : 0,
          width: block.quote ? width - 24 : width,
        })
        doc.moveDown(0.5)
        continue
      }

      if (block.kind === "listItem") {
        const marker = block.ordered ? `${block.index}. ` : "• "
        const indent = 18 * (block.depth + 1)
        doc.font(set.normal).fontSize(base).fillColor("#000").text(marker, { continued: true, indent })
        writeRuns(block.runs, base, { lineGap: 2, width: width - indent })
        doc.moveDown(0.2)
        continue
      }

      // table equal column widths, no cell spanning
      const columns = Math.max(...block.rows.map((r) => r.cells.length))
      const colWidth = width / columns
      doc.moveDown(0.4)

      for (const row of block.rows) {
        const heights = row.cells.map((cell) => {
          const text = cell.map((c) => c.text).join("") || " "
          doc.font(row.header ? set.bold : set.normal).fontSize(base - 1)
          return doc.heightOfString(text, { width: colWidth - 12 })
        })
        const rowHeight = Math.max(18, ...heights) + 10

        if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) doc.addPage()

        const top = doc.y
        row.cells.forEach((cell, i) => {
          const x = doc.page.margins.left + i * colWidth
          const text = cell.map((c) => c.text).join("")
          doc
            .font(row.header ? set.bold : set.normal)
            .fontSize(base - 1)
            .fillColor("#000")
            .text(text, x + 6, top + 5, { width: colWidth - 12 })
          doc.rect(x, top, colWidth, rowHeight).strokeColor("#cccccc").stroke()
        })
        doc.y = top + rowHeight
      }
      doc.moveDown(0.6)
    }

    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      doc
        .font(set.normal)
        .fontSize(9)
        .fillColor("#888")
        .text(
          `${i - range.start + 1} of ${range.count}`,
          doc.page.margins.left,
          doc.page.height - doc.page.margins.bottom + 24,
          { align: "center", width }
        )
    }

    doc.end()
  })
}
