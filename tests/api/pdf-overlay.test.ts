import { describe, expect, it } from "vitest"
import { PDFDocument } from "pdf-lib"
import { renderPdfOverlay, scriptOf } from "@/app/api/lib/export/pdfOverlay"
import { fieldsSchema, type TemplateField } from "@/lib/templates/fields"
import { canvasBoxToPdf, pdfBoxToCanvas, alignedX } from "@/lib/templates/overlay-coords"

const A4 = { width: 595, height: 842 }

async function blankForm(pages = 1) {
  const pdf = await PDFDocument.create()
  for (let i = 0; i < pages; i++) pdf.addPage([A4.width, A4.height])
  return Buffer.from(await pdf.save())
}

/**
 * Reads the text back out of a stamped PDF.
 *
 * This is the check that matters: pdf-lib will happily "draw" text a font
 * cannot encode, producing empty boxes on a document that looks finished. Only
 * extracting the characters again proves real glyphs were written.
 */
async function textOf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    disableFontFace: true,
  }).promise

  let out = ""
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    out += content.items.map((i) => ("str" in i ? i.str : "")).join(" ") + "\n"
  }
  return out
}

function field(spec: Partial<TemplateField> & { key: string }): TemplateField {
  return fieldsSchema.parse([{ label: spec.key, type: "text", ...spec }])[0]
}

const courtBox = { page: 0, x: 200, y: 700, width: 300, height: 18, fontSize: 11, align: "left" as const }

describe("scriptOf", () => {
  it("routes Latin, Devanagari and Gurmukhi to different fonts", () => {
    expect(scriptOf("Civil Judge, Ambala")).toBe("latin")
    expect(scriptOf("न्यायालय अम्बाला")).toBe("devanagari")
    expect(scriptOf("ਅਦਾਲਤ ਅੰਬਾਲਾ")).toBe("gurmukhi")
  })

  it("treats a mixed value by the script that needs the wider coverage", () => {
    expect(scriptOf("न्यायालय, Ambala")).toBe("devanagari")
  })
})

describe("renderPdfOverlay", () => {
  it("stamps a Latin value onto the court's own page", async () => {
    const out = await renderPdfOverlay(
      await blankForm(),
      [field({ key: "court_name", label: "In the Court of", overlay: courtBox })],
      { court_name: "Civil Judge (Sr. Div.), Ambala" }
    )
    expect(out.stamped).toBe(1)
    expect(out.warnings).toEqual([])
    expect(await textOf(out.bytes)).toContain("Civil Judge (Sr. Div.), Ambala")
  })

  it("renders real Devanagari glyphs, not empty boxes", async () => {
    const out = await renderPdfOverlay(
      await blankForm(),
      [field({ key: "court_name", label: "In the Court of", overlay: courtBox })],
      { court_name: "न्यायालय" }
    )
    expect(out.stamped).toBe(1)
    // Extraction proves the characters were encoded. Without a Devanagari font
    // this comes back as blanks even though drawText "succeeded".
    expect(await textOf(out.bytes)).toContain("न")
  })

  it("renders real Gurmukhi glyphs", async () => {
    const out = await renderPdfOverlay(
      await blankForm(),
      [field({ key: "court_name", label: "In the Court of", overlay: courtBox })],
      { court_name: "ਅਦਾਲਤ" }
    )
    expect(out.stamped).toBe(1)
    expect(await textOf(out.bytes)).toContain("ਅ")
  })

  it("reformats an ISO date the way a registry expects it", async () => {
    const out = await renderPdfOverlay(
      await blankForm(),
      [field({ key: "hearing_date", label: "Date of Hearing", type: "date", overlay: courtBox })],
      { hearing_date: "2026-10-14" }
    )
    expect(await textOf(out.bytes)).toContain("14-10-2026")
  })

  it("leaves an unanswered field blank rather than stamping anything", async () => {
    const out = await renderPdfOverlay(
      await blankForm(),
      [field({ key: "court_name", label: "In the Court of", overlay: courtBox })],
      {}
    )
    expect(out.stamped).toBe(0)
  })

  it("skips a field with no box, since it was never placed on the form", async () => {
    const out = await renderPdfOverlay(
      await blankForm(),
      [field({ key: "court_name", label: "In the Court of" })],
      { court_name: "Ambala" }
    )
    expect(out.stamped).toBe(0)
  })

  it("warns rather than silently clipping a value too long for its box", async () => {
    const out = await renderPdfOverlay(
      await blankForm(),
      [
        field({
          key: "court_name",
          label: "In the Court of",
          overlay: { ...courtBox, width: 40 },
        }),
      ],
      { court_name: "Additional District and Sessions Judge, Naraingarh, District Ambala" }
    )
    expect(out.warnings).toHaveLength(1)
    expect(out.warnings[0].label).toBe("In the Court of")
    expect(out.warnings[0].reason).toContain("too long")
  })

  it("warns when a field is placed on a page the PDF does not have", async () => {
    const out = await renderPdfOverlay(
      await blankForm(1),
      [field({ key: "court_name", label: "In the Court of", overlay: { ...courtBox, page: 3 } })],
      { court_name: "Ambala" }
    )
    expect(out.stamped).toBe(0)
    expect(out.warnings[0].reason).toContain("page 4")
  })

  it("stamps one table row per entry, marching down the page", async () => {
    const parties = fieldsSchema.parse([
      {
        key: "parties",
        label: "Address rows",
        type: "table",
        columns: [
          { key: "name", label: "Name with Father's Name", type: "text", required: true },
          { key: "tehsil", label: "Tehsil", type: "text", required: false },
        ],
        overlay: {
          page: 0,
          x: 60,
          y: 600,
          width: 470,
          height: 60,
          fontSize: 10,
          align: "left",
          rowHeight: 20,
          maxRows: 3,
          columns: {
            name: { x: 60, width: 240, align: "left" },
            tehsil: { x: 310, width: 220, align: "left" },
          },
        },
      },
    ])

    const out = await renderPdfOverlay(await blankForm(), parties, {
      parties: [
        { name: "Sohan Singh", tehsil: "Naraingarh" },
        { name: "Ram Lal", tehsil: "Ambala" },
      ],
    })

    expect(out.stamped).toBe(4)
    const text = await textOf(out.bytes)
    expect(text).toContain("Sohan Singh")
    expect(text).toContain("Ram Lal")
    expect(text).toContain("Naraingarh")
  })

  it("warns when there are more entries than the printed form has rows for", async () => {
    const parties = fieldsSchema.parse([
      {
        key: "parties",
        label: "Address rows",
        type: "table",
        columns: [{ key: "name", label: "Name", type: "text", required: true }],
        overlay: {
          page: 0,
          x: 60,
          y: 600,
          width: 470,
          height: 40,
          fontSize: 10,
          align: "left",
          rowHeight: 20,
          maxRows: 2,
          columns: { name: { x: 60, width: 240, align: "left" } },
        },
      },
    ])

    const out = await renderPdfOverlay(await blankForm(), parties, {
      parties: [{ name: "One" }, { name: "Two" }, { name: "Three" }],
    })

    expect(out.warnings.some((w) => w.reason.includes("only has room for 2"))).toBe(true)
    const text = await textOf(out.bytes)
    expect(text).not.toContain("Three")
  })

  it("leaves the court's own page furniture untouched", async () => {
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([A4.width, A4.height])
    page.drawText("ADDRESS FORM", { x: 200, y: 800, size: 16 })
    const source = Buffer.from(await pdf.save())

    const out = await renderPdfOverlay(
      source,
      [field({ key: "court_name", label: "In the Court of", overlay: courtBox })],
      { court_name: "Ambala" }
    )

    const text = await textOf(out.bytes)
    expect(text).toContain("ADDRESS FORM")
    expect(text).toContain("Ambala")
  })
})

describe("overlay coordinates", () => {
  it("flips the y-axis exactly once between canvas and PDF space", () => {
    const canvas = { x: 100, y: 50, width: 200, height: 20 }
    const scale = 2
    const pdfBox = canvasBoxToPdf(canvas, scale, A4.height)

    // A box 50px from the canvas top, at scale 2, is 25pt down the page.
    expect(pdfBox.x).toBe(50)
    expect(pdfBox.width).toBe(100)
    expect(pdfBox.y).toBe(A4.height - 25 - 10)

    expect(pdfBoxToCanvas(pdfBox, scale, A4.height)).toEqual(canvas)
  })

  it("aligns text within its box", () => {
    const box = { x: 100, y: 0, width: 200, height: 20 }
    expect(alignedX(box, 50, "left")).toBe(102)
    expect(alignedX(box, 50, "center")).toBe(175)
    expect(alignedX(box, 50, "right")).toBe(248)
  })
})
