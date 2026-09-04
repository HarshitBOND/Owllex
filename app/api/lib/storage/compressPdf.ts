import { deflateSync, inflateSync } from "zlib"
import {
  PDFArray,
  PDFBool,
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
} from "pdf-lib"
import sharp from "sharp"
import type { Sharp } from "sharp"

/**
 * Recompresses a PDF in-process, with no backend and no Ghostscript.
 *
 * PDF compression used to be handed to a Python service (Ghostscript cannot
 * run on Vercel), via a now-deleted compressAndStore.ts that every upload
 * route called. That call was a no-op whenever the service was unreachable,
 * and it swallowed the failure, so PDFs across the vault, attachments, and
 * corpus were stored byte-for-byte while the app reported compression as on.
 * This is the single compressor all three routes call now: it runs on
 * Vercel, so it cannot be switched off by a service being down.
 *
 * Two passes, because the two kinds of document in this vault waste space in
 * completely different places:
 *
 *   Scans are almost entirely page images, so every embedded image is
 *     downscaled and re-encoded as JPEG. Lossy.
 *   Generated documents -- anything this app exports through pdfkit, and plenty
 *     of e-filing output -- are text, and routinely ship with their content
 *     streams stored with no filter at all. Deflating those is lossless and is
 *     the whole file: 45 KB of raw streams in a real 49 KB contract deflate to
 *     under 10 KB. An image-only pass takes 4% off that same file.
 *
 * Then the whole thing is rewritten with object streams, which packs the
 * remaining non-stream objects and the cross-reference table.
 *
 * The image pass is lossy and irreversible in the same way the Ghostscript pass
 * was: fine print and seals on a scan will soften. The deflate pass changes no
 * pixels and no glyphs. originalSha256/originalSize on the vault row still
 * record the file as uploaded.
 *
 * Never throws. Anything unexpected -- an encrypted file, a filter we do not
 * decode, a sharp failure -- returns the input unchanged with a reason, because
 * compression is an optimization and must never be able to fail an upload.
 */

// A scanned page rendered wider than this is carrying detail no viewport shows.
// 1600px on the long edge is ~135 dpi across a letter page: fine print stays
// legible, which the old 72 dpi Ghostscript profile did not guarantee.
const MAX_IMAGE_EDGE = Number(process.env.VAULT_PDF_MAX_IMAGE_EDGE || 1600)
const JPEG_QUALITY = Number(process.env.VAULT_PDF_JPEG_QUALITY || 72)

// Below this an image is a logo, letterhead or seal. Re-encoding those saves
// almost nothing and is where JPEG artifacts are most visible.
const MIN_IMAGE_EDGE = 200

// A serverless function has a wall clock. Images are processed until the budget
// is spent, then the file is saved with whatever was done -- a partial pass is
// still smaller, and a timeout would lose the upload.
const TIME_BUDGET_MS = Number(process.env.VAULT_PDF_COMPRESSION_TIMEOUT_MS || 20000)

export type CompressedPdf = {
  buffer: Buffer
  originalBytes: number
  storedBytes: number
  compressed: boolean
  imagesRecompressed: number
  streamsDeflated: number
  /** Why nothing was taken off, when compressed is false. */
  reason: string
}

export async function compressPdf(input: Buffer): Promise<CompressedPdf> {
  const originalBytes = input.length
  const unchanged = (reason: string): CompressedPdf => ({
    buffer: input,
    originalBytes,
    storedBytes: originalBytes,
    compressed: false,
    imagesRecompressed: 0,
    streamsDeflated: 0,
    reason,
  })

  if (input.subarray(0, 5).toString("latin1") !== "%PDF-") return unchanged("not-a-pdf")

  let pdf: PDFDocument
  let pageCount: number
  try {
    // Deliberately not ignoreEncryption: pdf-lib cannot re-encrypt, so saving an
    // encrypted document would write out an unreadable file.
    pdf = await PDFDocument.load(input, { updateMetadata: false })
    pageCount = pdf.getPageCount()
  } catch {
    return unchanged("unparseable-or-encrypted")
  }
  if (pageCount === 0) return unchanged("no-pages")

  const deadline = Date.now() + TIME_BUDGET_MS
  let imagesRecompressed = 0
  let streamsDeflated = 0
  let timedOut = false

  // A snapshot array, so assigning into the context while iterating is safe.
  for (const [ref, object] of pdf.context.enumerateIndirectObjects()) {
    if (Date.now() > deadline) {
      timedOut = true
      break
    }
    if (!(object instanceof PDFRawStream)) continue

    const reencoded = await recompressImage(object, pdf.context)
    if (reencoded) {
      pdf.context.assign(ref, reencoded)
      imagesRecompressed++
      continue
    }

    // Not an image this pass rewrites -- but if it carries no filter at all it
    // is sitting in the file raw, and deflating it costs nothing but CPU.
    const deflated = deflateStream(object, pdf.context)
    if (deflated) {
      pdf.context.assign(ref, deflated)
      streamsDeflated++
    }
  }

  let saved: Uint8Array
  try {
    saved = await pdf.save({ useObjectStreams: true, addDefaultPage: false })
  } catch {
    return unchanged("save-failed")
  }

  const buffer = Buffer.from(saved)

  // A rewrite can come out bigger -- a small text PDF that was already tightly
  // packed, or a file whose images all declined re-encoding. Never regress.
  if (buffer.length >= originalBytes) {
    return unchanged(
      imagesRecompressed === 0 && streamsDeflated === 0 ? "nothing-to-compress" : "no-size-gain"
    )
  }

  // This is a vault of legal documents: a rewrite that silently dropped pages
  // would be far worse than one that saved nothing. Re-read what is about to be
  // stored and refuse it unless every page survived.
  try {
    const reloaded = await PDFDocument.load(buffer, { updateMetadata: false })
    if (reloaded.getPageCount() !== pageCount) return unchanged("page-count-mismatch")
  } catch {
    return unchanged("output-unreadable")
  }

  return {
    buffer,
    originalBytes,
    storedBytes: buffer.length,
    compressed: true,
    imagesRecompressed,
    streamsDeflated,
    reason: timedOut ? "partial-time-budget-exhausted" : "",
  }
}

/**
 * Deflates a stream that is stored with no filter, or returns null to leave it
 * alone.
 *
 * Lossless and by far the biggest win on generated documents: pdf-lib's
 * object-stream rewrite packs everything except streams, so an uncompressed
 * content stream stays uncompressed all the way to R2 unless this runs.
 */
function deflateStream(stream: PDFRawStream, context: PDFContext): PDFRawStream | null {
  try {
    const dict = stream.dict

    // Anything already carrying a filter is already encoded. A PDFRef here
    // reads as "present" too, which is the safe direction.
    if (dict.get(PDFName.of("Filter")) !== undefined) return null
    // Decode parameters with no filter to belong to would be reinterpreted
    // against the FlateDecode set below.
    if (dict.get(PDFName.of("DecodeParms")) !== undefined) return null

    const type = dict.lookupMaybe(PDFName.of("Type"), PDFName)?.asString()
    // pdf-lib rebuilds the cross-reference table and object streams on save, and
    // an XMP packet is specified to stay readable by a parser that does not
    // inflate. All three are left exactly as they are.
    if (type === "/XRef" || type === "/ObjStm" || type === "/Metadata") return null

    const contents = Buffer.from(stream.getContents())
    if (contents.length === 0) return null

    const deflated = deflateSync(contents, { level: 9 })
    if (deflated.length >= contents.length) return null

    const replacement = dict.clone(context)
    replacement.set(PDFName.of("Filter"), PDFName.of("FlateDecode"))
    return PDFRawStream.of(replacement, deflated)
  } catch {
    return null
  }
}

/**
 * Returns a replacement for one image XObject, or null to leave it alone.
 *
 * Bailing out is always safe and always the default: an image this does not
 * fully understand is one it must not rewrite. The whole body is guarded
 * because pdf-lib's typed lookups throw on a dict whose shape is unexpected,
 * and one odd image must not fail the file.
 */
async function recompressImage(
  stream: PDFRawStream,
  context: PDFContext
): Promise<PDFRawStream | null> {
  try {
    const dict = stream.dict

    if (dict.lookupMaybe(PDFName.of("Subtype"), PDFName)?.asString() !== "/Image") return null

    // A stencil mask is a 1-bit shape, not a picture. JPEG cannot represent one.
    if (dict.lookupMaybe(PDFName.of("ImageMask"), PDFBool)?.asBoolean()) return null

    const width = dict.lookupMaybe(PDFName.of("Width"), PDFNumber)?.asNumber()
    const height = dict.lookupMaybe(PDFName.of("Height"), PDFNumber)?.asNumber()
    if (!width || !height) return null
    if (Math.max(width, height) < MIN_IMAGE_EDGE) return null

    const source = decodeImage(stream, dict, width, height)
    if (!source) return null

    const originalContents = stream.getContents()

    // sharp reports "b-w" with one channel for a greyscale scan, which is most
    // of what a court filing is. Keeping it single-channel is both smaller and
    // truer than promoting it to RGB.
    const greyscale = (await source.metadata()).channels === 1

    const { data, info } = await source
      .resize({
        width: Math.min(width, MAX_IMAGE_EDGE),
        height: Math.min(height, MAX_IMAGE_EDGE),
        fit: "inside",
        withoutEnlargement: true,
      })
      // Forces a channel count JPEG and the PDF colour space agree on. Without
      // this a CMYK scan stays 4-channel and the /DeviceRGB below would lie.
      .toColourspace(greyscale ? "b-w" : "srgb")
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer({ resolveWithObject: true })

    if (data.length >= originalContents.length) return null

    const replacement = dict.clone(context)
    replacement.set(PDFName.of("Width"), context.obj(info.width))
    replacement.set(PDFName.of("Height"), context.obj(info.height))
    replacement.set(PDFName.of("BitsPerComponent"), context.obj(8))
    replacement.set(
      PDFName.of("ColorSpace"),
      PDFName.of(info.channels === 1 ? "DeviceGray" : "DeviceRGB")
    )
    replacement.set(PDFName.of("Filter"), PDFName.of("DCTDecode"))
    replacement.delete(PDFName.of("DecodeParms"))
    // /Decode remaps the *original* samples (an inverted CMYK scan, say). The
    // re-encoded samples need no remapping, and leaving it inverts them.
    replacement.delete(PDFName.of("Decode"))

    return PDFRawStream.of(replacement, data)
  } catch {
    return null
  }
}

/** A sharp pipeline over the image's samples, or null if the encoding is one we do not decode. */
function decodeImage(
  stream: PDFRawStream,
  dict: PDFDict,
  width: number,
  height: number
): Sharp | null {
  const filters = filterNames(dict)
  // Cascaded filters (Flate over DCT, ASCII85 wrappers) would each need
  // unwinding in order. Rare enough that skipping is better than guessing.
  if (filters.length > 1) return null

  const contents = Buffer.from(stream.getContents())

  // Already a JPEG -- hand the encoded bytes straight to sharp.
  if (filters[0] === "/DCTDecode") return sharp(contents)

  // JPXDecode, CCITTFaxDecode, JBIG2Decode and LZWDecode all land here and are
  // deliberately left alone: the fax/JBIG2 ones are 1-bit scans that JPEG makes
  // both larger and worse.
  if (filters.length === 1 && filters[0] !== "/FlateDecode") return null

  // What is left is raw samples, either stored that way or one inflate from it.
  // Either way the layout has to be one sharp can read.
  if (dict.lookupMaybe(PDFName.of("BitsPerComponent"), PDFNumber)?.asNumber() !== 8) return null

  const colourSpace = dict.lookupMaybe(PDFName.of("ColorSpace"), PDFName)?.asString()
  const channels = colourSpace === "/DeviceRGB" ? 3 : colourSpace === "/DeviceGray" ? 1 : 0
  // Indexed, ICCBased and Separation spaces arrive as arrays and need their
  // lookup table applied to become displayable samples.
  if (!channels) return null

  // A DecodeParms that is an array belongs to a filter chain, which the single
  // filter check above already excluded -- but it must not be read as "absent",
  // because that would feed still-predicted bytes to sharp as if they were
  // pixels and store a scrambled image.
  const rawParms = dict.get(PDFName.of("DecodeParms"))
  const parms = rawParms === undefined ? undefined : dict.lookupMaybe(PDFName.of("DecodeParms"), PDFDict)
  if (rawParms !== undefined && !parms) return null

  // Stored with no filter at all: the bytes are already the samples. Worth
  // catching here rather than leaving to the deflate pass, because JPEG takes
  // far more off a large image than deflating its raw pixels does.
  if (filters.length === 0) {
    if (rawParms !== undefined) return null
    return sizedSharp(contents, width, height, channels)
  }

  let samples: Buffer
  try {
    samples = inflateSync(contents)
  } catch {
    return null
  }

  const predictor = parms?.lookupMaybe(PDFName.of("Predictor"), PDFNumber)?.asNumber() ?? 1
  if (predictor >= 10) {
    // Anything embedded from a PNG lands here (Predictor 15), which is a large
    // share of real images in real PDFs -- worth un-filtering rather than
    // skipping.
    const columns = parms?.lookupMaybe(PDFName.of("Columns"), PDFNumber)?.asNumber() ?? 1
    const colors = parms?.lookupMaybe(PDFName.of("Colors"), PDFNumber)?.asNumber() ?? 1
    const bpc = parms?.lookupMaybe(PDFName.of("BitsPerComponent"), PDFNumber)?.asNumber() ?? 8
    if (bpc !== 8 || colors !== channels || columns !== width) return null

    const undone = undoPngPredictor(samples, columns, colors)
    if (!undone) return null
    samples = undone
  } else if (predictor !== 1) {
    // TIFF predictor (2). Rare enough not to be worth a second implementation.
    return null
  }

  return sizedSharp(samples, width, height, channels)
}

/** Wraps raw samples, refusing a buffer too short to be the image it claims to be. */
function sizedSharp(samples: Buffer, width: number, height: number, channels: number): Sharp | null {
  if (samples.length < width * height * channels) return null
  return sharp(samples, { raw: { width, height, channels: channels as 1 | 3 } })
}

/**
 * Reverses PNG row filtering (PDF Predictor 10-15).
 *
 * Each row arrives as one filter-type byte followed by `rowLength` filtered
 * bytes; the filter is undone against the pixel `bpp` bytes to the left and the
 * already-reconstructed row above. Returns null if the buffer is not a whole
 * number of rows, which means the parameters do not describe these bytes.
 */
function undoPngPredictor(data: Buffer, columns: number, colors: number): Buffer | null {
  const bpp = colors // 8 bits per component, so one byte per component
  const rowLength = columns * colors
  if (data.length % (rowLength + 1) !== 0) return null

  const rows = data.length / (rowLength + 1)
  const out = Buffer.alloc(rows * rowLength)

  for (let row = 0; row < rows; row++) {
    const filter = data[row * (rowLength + 1)]
    const src = (row * (rowLength + 1)) + 1
    const dst = row * rowLength
    const up = dst - rowLength

    for (let i = 0; i < rowLength; i++) {
      const raw = data[src + i]
      const left = i >= bpp ? out[dst + i - bpp] : 0
      const above = row > 0 ? out[up + i] : 0
      const upperLeft = row > 0 && i >= bpp ? out[up + i - bpp] : 0

      let value: number
      switch (filter) {
        case 0: value = raw; break
        case 1: value = raw + left; break
        case 2: value = raw + above; break
        case 3: value = raw + ((left + above) >> 1); break
        case 4: value = raw + paeth(left, above, upperLeft); break
        default: return null
      }
      out[dst + i] = value & 0xff
    }
  }

  return out
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

function filterNames(dict: PDFDict): string[] {
  const filter = dict.get(PDFName.of("Filter"))
  if (filter instanceof PDFName) return [filter.asString()]
  if (filter instanceof PDFArray) {
    return filter.asArray().map((entry) => (entry instanceof PDFName ? entry.asString() : ""))
  }
  return []
}
