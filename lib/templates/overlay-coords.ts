/**
 * Converting between the admin mapper's canvas and the PDF's own coordinates.
 *
 * PDF user space puts the origin at the BOTTOM-left with y increasing upward;
 * a canvas puts it at the TOP-left with y increasing downward. Getting that
 * backwards puts every stamped value a page-height away from where it belongs,
 * so the flip happens exactly once -- here -- and stored coordinates are always
 * already in PDF space, ready to hand straight to pdf-lib.
 */

export type CanvasBox = { x: number; y: number; width: number; height: number }
export type PdfBox = { x: number; y: number; width: number; height: number }

/**
 * @param scale canvas pixels per PDF point (pdf.js viewport scale)
 * @param pageHeightPt the page's height in points, unscaled
 */
export function canvasBoxToPdf(box: CanvasBox, scale: number, pageHeightPt: number): PdfBox {
  const width = box.width / scale
  const height = box.height / scale
  const x = box.x / scale
  // The canvas gives the box's TOP edge; PDF wants its BOTTOM edge.
  const y = pageHeightPt - box.y / scale - height
  return { x, y, width, height }
}

export function pdfBoxToCanvas(box: PdfBox, scale: number, pageHeightPt: number): CanvasBox {
  return {
    x: box.x * scale,
    y: (pageHeightPt - box.y - box.height) * scale,
    width: box.width * scale,
    height: box.height * scale,
  }
}

/** Where a line of text sits inside its box, so glyphs are not clipped by the baseline. */
export function baselineWithin(box: PdfBox, fontSize: number): number {
  // Roughly centres a single line: descenders sit about a fifth below baseline.
  const centred = box.y + (box.height - fontSize) / 2 + fontSize * 0.22
  return Math.max(box.y + fontSize * 0.15, centred)
}

export function alignedX(
  box: PdfBox,
  textWidth: number,
  align: "left" | "center" | "right",
  padding = 2
): number {
  if (align === "center") return box.x + (box.width - textWidth) / 2
  if (align === "right") return box.x + box.width - textWidth - padding
  return box.x + padding
}
