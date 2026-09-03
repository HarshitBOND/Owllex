import { describe, expect, it } from "vitest"
import PDFDocument from "pdfkit"
import sharp from "sharp"
import { PDFDocument as PDFLib } from "pdf-lib"
import { compressPdf } from "@/app/api/lib/storage/compressPdf"

/**
 * Fixtures are built rather than committed so the assertions are about the
 * compressor, not about one particular file someone once checked in.
 */
async function buildPdf(images: Buffer[]): Promise<Buffer> {
  const doc = new PDFDocument({ autoFirstPage: false })
  const chunks: Buffer[] = []
  doc.on("data", (c: Buffer) => chunks.push(c))
  const done = new Promise((resolve) => doc.on("end", resolve))
  for (const image of images) {
    doc.addPage({ size: "LETTER", margin: 0 })
    doc.image(image, 0, 0, { width: 612, height: 792 })
  }
  doc.end()
  await done
  return Buffer.concat(chunks)
}

/** A noisy 300dpi page, which is what a scanned filing actually looks like. */
function scanSamples(width: number, height: number, seed: number): Buffer {
  const px = Buffer.alloc(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    const row = (i / width) | 0
    const isTextBand = row % 60 < 18 && i % width > 200 && i % width < width - 250
    const value = isTextBand ? 40 + ((i * seed) % 60) : 225 + ((i * 7 + seed) % 25)
    px[i * 3] = value
    px[i * 3 + 1] = value
    px[i * 3 + 2] = value
  }
  return px
}

describe("compressPdf", () => {
  it("takes most of the bytes off a scanned PDF and keeps every page", async () => {
    const page = await sharp(scanSamples(2550, 3300, 1), {
      raw: { width: 2550, height: 3300, channels: 3 },
    })
      .jpeg({ quality: 92 })
      .toBuffer()
    const input = await buildPdf([page, page, page])

    const result = await compressPdf(input)

    expect(result.compressed).toBe(true)
    expect(result.imagesRecompressed).toBeGreaterThan(0)
    expect(result.storedBytes).toBeLessThan(result.originalBytes / 2)
    expect((await PDFLib.load(result.buffer)).getPageCount()).toBe(3)
  }, 120000)

  it("decodes PNG-derived images, which arrive Flate-encoded behind a predictor", async () => {
    // pdfkit embeds a PNG as FlateDecode with /Predictor 15. Skipping those
    // left the largest images in many real PDFs completely untouched.
    const width = 1400
    const height = 1800
    const rgb = Buffer.alloc(width * height * 3)
    for (let i = 0; i < width * height; i++) {
      const x = i % width
      const y = (i / width) | 0
      rgb[i * 3] = (x * 255) / width
      rgb[i * 3 + 1] = (y * 255) / height
      rgb[i * 3 + 2] = (x + y) % 256
    }
    const png = await sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer()

    const result = await compressPdf(await buildPdf([png]))

    expect(result.imagesRecompressed).toBe(1)
    expect(result.storedBytes).toBeLessThan(result.originalBytes / 2)
  }, 120000)

  it("deflates content streams stored with no filter, losslessly", async () => {
    // This is what an app-generated document actually looks like: no images at
    // all, and its text sitting in the file raw. An image-only pass takes ~4%
    // off a real 49 KB contract; deflating its streams takes ~76%.
    const doc = new PDFDocument({ compress: false })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    const done = new Promise((resolve) => doc.on("end", resolve))
    for (let page = 0; page < 12; page++) {
      if (page > 0) doc.addPage()
      for (let line = 0; line < 30; line++) {
        doc.text(`Clause ${line} of schedule ${page}: the parties agree as follows. `.repeat(3))
      }
    }
    doc.end()
    await done
    const input = Buffer.concat(chunks)

    const pagesIn = (await PDFLib.load(input)).getPageCount()
    const result = await compressPdf(input)

    expect(result.streamsDeflated).toBeGreaterThan(0)
    expect(result.storedBytes).toBeLessThan(result.originalBytes / 2)
    // Lossless, so every page has to come back.
    expect((await PDFLib.load(result.buffer)).getPageCount()).toBe(pagesIn)
  }, 120000)

  it("leaves a non-PDF alone", async () => {
    const docx = Buffer.from("PK\x03\x04 this is a docx, not a pdf")
    const result = await compressPdf(docx)

    expect(result.compressed).toBe(false)
    expect(result.reason).toBe("not-a-pdf")
    expect(result.buffer).toBe(docx)
  })

  it("returns the original rather than throwing on a file it cannot parse", async () => {
    const result = await compressPdf(Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(64, 0)]))

    expect(result.compressed).toBe(false)
    expect(result.storedBytes).toBe(result.originalBytes)
  })

  it("never stores more bytes than it was given", async () => {
    // A tiny text PDF has no page images to take anything off, so the guard
    // against a rewrite that grows the file is the only thing standing between
    // compression and a storage regression.
    const text = new PDFDocument()
    const chunks: Buffer[] = []
    text.on("data", (c: Buffer) => chunks.push(c))
    const done = new Promise((resolve) => text.on("end", resolve))
    text.text("A short order of the court.")
    text.end()
    await done

    const result = await compressPdf(Buffer.concat(chunks))

    expect(result.storedBytes).toBeLessThanOrEqual(result.originalBytes)
  }, 60000)
})
