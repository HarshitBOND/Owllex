// fontkit's Indic shaping is compiled against a regenerator runtime that it
// does not ship. Without this, embedding a Devanagari or Gurmukhi font throws
// "regeneratorRuntime is not defined" the moment a complex script is shaped --
// so it has to be installed before fontkit is imported.
import regeneratorRuntime from "regenerator-runtime"
if (!(globalThis as { regeneratorRuntime?: unknown }).regeneratorRuntime) {
  ;(globalThis as { regeneratorRuntime?: unknown }).regeneratorRuntime = regeneratorRuntime
}

import fs from "node:fs"
import path from "node:path"
import { PDFDocument, type PDFFont } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import type { TemplateField } from "@/lib/templates/fields"
import { alignedX, baselineWithin, type PdfBox } from "@/lib/templates/overlay-coords"

/**
 * Stamps a draft's answers onto the court's own PDF.
 *
 * The HTML rebuild is a very good likeness of a court form; this is the same
 * form. Rules, seals, margins and the registry's own typography are untouched
 * because nothing is redrawn -- only the answers are added on top.
 *
 * Coordinates come from the template version the draft is pinned to, which is
 * why versioning had to exist first: a body edited after the boxes were placed
 * would leave every value stamped in the wrong place.
 */

const FONT_DIR = path.join(process.cwd(), "assets", "fonts")

/**
 * pdf-lib's standard fonts are WinAnsi and cannot encode Indic text at all, so
 * a Hindi or Punjabi form would stamp as blanks. Each script gets a font that
 * actually covers it; all three also cover Latin, so a mixed value like
 * "न्यायालय, Ambala" is drawn in one pass rather than split mid-string.
 */
const FONT_FILES = {
  latin: "NotoSans-Regular.ttf",
  devanagari: "NotoSansDevanagari-Regular.ttf",
  gurmukhi: "MuktaMahee-Regular.ttf",
} as const

type ScriptKey = keyof typeof FONT_FILES

const DEVANAGARI = /[ऀ-ॿ]/
const GURMUKHI = /[਀-੿]/

/** Picks a font by the script actually present, so Latin never silently boxes out. */
export function scriptOf(text: string): ScriptKey {
  if (DEVANAGARI.test(text)) return "devanagari"
  if (GURMUKHI.test(text)) return "gurmukhi"
  return "latin"
}

export type StampWarning = {
  key: string
  label: string
  reason: string
}

export type OverlayResult = {
  bytes: Uint8Array
  warnings: StampWarning[]
  stamped: number
}

const MIN_FONT_SIZE = 5
const PADDING = 2

function loadFont(script: ScriptKey): Buffer {
  return fs.readFileSync(path.join(FONT_DIR, FONT_FILES[script]))
}

/**
 * Shrinks to fit, then truncates -- and reports either way.
 *
 * Silently clipping an over-long name is the worst outcome here: the document
 * looks finished and reaches a registry missing half a party's name. Every
 * value that did not fit as written comes back as a warning the user is shown.
 */
function fitText(
  text: string,
  font: PDFFont,
  box: PdfBox,
  requestedSize: number
): { text: string; size: number; truncated: boolean } {
  const usable = Math.max(box.width - PADDING * 2, 1)
  let size = requestedSize

  while (size > MIN_FONT_SIZE && font.widthOfTextAtSize(text, size) > usable) {
    size -= 0.5
  }

  if (font.widthOfTextAtSize(text, size) <= usable) {
    return { text, size, truncated: false }
  }

  let clipped = text
  while (clipped.length > 1 && font.widthOfTextAtSize(`${clipped}…`, size) > usable) {
    clipped = clipped.slice(0, -1)
  }
  return { text: `${clipped}…`, size, truncated: true }
}

function formatValue(type: string, raw: unknown): string {
  if (raw === null || raw === undefined) return ""
  const value = String(raw).trim()
  if (!value) return ""
  if (type === "date") {
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`
  }
  return value
}

export async function renderPdfOverlay(
  sourcePdf: Buffer | Uint8Array,
  fields: TemplateField[],
  values: Record<string, unknown>
): Promise<OverlayResult> {
  const pdf = await PDFDocument.load(sourcePdf, { ignoreEncryption: true })
  pdf.registerFontkit(fontkit)

  // Embedded lazily and cached: a Latin-only form should not carry a 240KB
  // Devanagari font in its output.
  const fontCache = new Map<ScriptKey, PDFFont>()
  const fontFor = async (script: ScriptKey) => {
    const cached = fontCache.get(script)
    if (cached) return cached
    const embedded = await pdf.embedFont(loadFont(script), { subset: true })
    fontCache.set(script, embedded)
    return embedded
  }

  const pages = pdf.getPages()
  const warnings: StampWarning[] = []
  let stamped = 0

  const draw = async (opts: {
    text: string
    box: PdfBox
    page: number
    fontSize: number
    align: "left" | "center" | "right"
    key: string
    label: string
  }) => {
    const page = pages[opts.page]
    if (!page) {
      warnings.push({
        key: opts.key,
        label: opts.label,
        reason: `is placed on page ${opts.page + 1}, which this PDF does not have`,
      })
      return
    }

    const font = await fontFor(scriptOf(opts.text))
    const fitted = fitText(opts.text, font, opts.box, opts.fontSize)

    page.drawText(fitted.text, {
      x: alignedX(opts.box, font.widthOfTextAtSize(fitted.text, fitted.size), opts.align, PADDING),
      y: baselineWithin(opts.box, fitted.size),
      size: fitted.size,
      font,
    })
    stamped++

    if (fitted.truncated) {
      warnings.push({
        key: opts.key,
        label: opts.label,
        reason: `was too long for the space on the form and has been shortened to "${fitted.text}"`,
      })
    }
  }

  for (const field of fields) {
    const overlay = field.overlay
    if (!overlay) continue

    if (field.type === "table") {
      const rows = Array.isArray(values[field.key]) ? (values[field.key] as Record<string, unknown>[]) : []
      const rowHeight = overlay.rowHeight ?? overlay.height
      const maxRows = overlay.maxRows ?? Math.max(1, Math.floor(overlay.height / Math.max(rowHeight, 1)))

      if (rows.length > maxRows) {
        warnings.push({
          key: field.key,
          label: field.label,
          reason: `has ${rows.length} entries but the printed form only has room for ${maxRows}. The rest are not on the stamped copy.`,
        })
      }

      for (const [index, row] of rows.slice(0, maxRows).entries()) {
        for (const column of field.columns) {
          const cell = overlay.columns?.[column.key]
          if (!cell) continue
          const text = formatValue(column.type, row?.[column.key])
          if (!text) continue

          await draw({
            text,
            // Rows march DOWN the page, and y increases upward in PDF space,
            // so each successive row subtracts its pitch.
            box: {
              x: cell.x,
              y: overlay.y - index * rowHeight,
              width: cell.width,
              height: rowHeight,
            },
            page: overlay.page,
            fontSize: overlay.fontSize,
            align: cell.align ?? "left",
            key: `${field.key}.${index}.${column.key}`,
            label: `${column.label} (entry ${index + 1})`,
          })
        }
      }
      continue
    }

    const text = formatValue(field.type, values[field.key])
    if (!text) continue

    await draw({
      text,
      box: { x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height },
      page: overlay.page,
      fontSize: overlay.fontSize,
      align: overlay.align,
      key: field.key,
      label: field.label,
    })
  }

  return { bytes: await pdf.save(), warnings, stamped }
}
