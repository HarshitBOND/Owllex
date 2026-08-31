import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx"
import type { Align, Block, Inline } from "./htmlBlocks"

const NUMBERING = "lexvert-ordered"

const alignmentOf = (align: Align) =>
  align === "center" ? AlignmentType.CENTER : align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT

function childrenOf(runs: Inline[], size: number) {
  return runs.map((run) => {
    const textRun = new TextRun({
      text: run.text,
      bold: run.bold,
      italics: run.italic,
      underline: run.underline ? {} : undefined,
      strike: run.strike,
      size: size * 2, // docx measures in half-points
    })
    return run.href ? new ExternalHyperlink({ children: [textRun], link: run.href }) : textRun
  })
}

export async function renderDocx(
  blocks: Block[],
  options: { title: string; fontFamily: string; fontSizePt: number }
) {
  const size = options.fontSizePt
  const children: (Paragraph | Table)[] = []

  for (const block of blocks) {
    if (block.kind === "rule") {
      children.push(new Paragraph({ text: "", border: { bottom: { style: "single", size: 6, color: "CCCCCC" } } }))
      continue
    }

    if (block.kind === "heading") {
      children.push(
        new Paragraph({
          children: childrenOf(block.runs, size + (block.level === 1 ? 5 : block.level === 2 ? 2 : 1)),
          heading:
            block.level === 1
              ? HeadingLevel.HEADING_1
              : block.level === 2
                ? HeadingLevel.HEADING_2
                : HeadingLevel.HEADING_3,
          alignment: block.level === 1 ? AlignmentType.CENTER : alignmentOf(block.align),
          spacing: { before: 200, after: 120 },
        })
      )
      continue
    }

    if (block.kind === "paragraph") {
      children.push(
        new Paragraph({
          children: childrenOf(block.runs, size),
          alignment: alignmentOf(block.align),
          spacing: { after: 160 },
          indent: block.quote ? { left: 480 } : undefined,
        })
      )
      continue
    }

    if (block.kind === "listItem") {
      children.push(
        new Paragraph({
          children: childrenOf(block.runs, size),
          spacing: { after: 80 },
          ...(block.ordered
            ? { numbering: { reference: NUMBERING, level: Math.min(block.depth, 2) } }
            : { bullet: { level: Math.min(block.depth, 2) } }),
        })
      )
      continue
    }

    const columns = Math.max(...block.rows.map((r) => r.cells.length))
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: block.rows.map(
          (row) =>
            new TableRow({
              tableHeader: row.header,
              children: Array.from({ length: columns }).map(
                (_, i) =>
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: childrenOf(
                          (row.cells[i] || []).map((r) => ({ ...r, bold: r.bold || row.header })),
                          size - 1
                        ),
                      }),
                    ],
                  })
              ),
            })
        ),
      })
    )
  }

  if (children.length === 0) children.push(new Paragraph({ text: "" }))

  const doc = new Document({
    title: options.title,
    styles: {
      default: {
        document: { run: { font: options.fontFamily, size: size * 2 } },
      },
    },
    // Without this config a numbered list renders as literal "1." text, not a Word list.
    numbering: {
      config: [
        {
          reference: NUMBERING,
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START },
            { level: 1, format: LevelFormat.LOWER_LETTER, text: "%2.", alignment: AlignmentType.START },
            { level: 2, format: LevelFormat.LOWER_ROMAN, text: "%3.", alignment: AlignmentType.START },
          ],
        },
      ],
    },
    sections: [{ children }],
  })

  return Packer.toBuffer(doc)
}
