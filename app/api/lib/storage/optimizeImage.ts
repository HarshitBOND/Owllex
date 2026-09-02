import sharp from "sharp"

/**
 * Downscales and re-encodes an uploaded image before it is stored.
 *
 * Uploads used to land in R2 byte-for-byte, so a 10 MB phone photo cost 10 MB
 * of storage and 10 MB of transfer on every view -- these objects are served
 * straight off the public Worker and never pass through Next's image
 * optimizer, so nothing else was ever going to shrink them. WebP at 1920px
 * typically takes 95%+ off a camera original with no visible difference at the
 * sizes the app actually renders.
 *
 * Re-encoding also drops EXIF, which is worth having on its own: phone photos
 * carry GPS coordinates, and this bucket is publicly readable.
 */

// Rendered at most full-bleed on a desktop viewport; 1920 covers that at 1x
// and everything smaller at 2x.
const MAX_WIDTH = 1920
const QUALITY = 80

export type OptimizedImage = {
  buffer: Buffer
  contentType: string
  extension: string
  originalBytes: number
  storedBytes: number
}

export async function optimizeImage(input: Buffer, mimeType?: string): Promise<OptimizedImage> {
  const originalBytes = input.length

  const unchanged = (): OptimizedImage => ({
    buffer: input,
    contentType: mimeType || "application/octet-stream",
    extension: extensionForMime(mimeType),
    originalBytes,
    storedBytes: originalBytes,
  })

  try {
    const image = sharp(input, { animated: true })
    const meta = await image.metadata()

    // SVG has no raster source to downscale and re-encoding it to WebP would
    // rasterize it, so it is stored as uploaded.
    if (meta.format === "svg") return unchanged()

    const optimized = await image
      // Applies the EXIF orientation flag, then strips the tag with it -- without
      // this, dropping metadata would leave sideways photos.
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer()

    // An already-small WebP or a tiny PNG icon can come out larger. Never regress.
    if (optimized.length >= originalBytes) return unchanged()

    return {
      buffer: optimized,
      contentType: "image/webp",
      extension: "webp",
      originalBytes,
      storedBytes: optimized.length,
    }
  } catch {
    // A file that passed signature validation but that sharp cannot decode is
    // stored as-is rather than failing the upload.
    return unchanged()
  }
}

/** Swaps a sanitized filename's extension so the key matches what was stored. */
export function withExtension(fileName: string, extension: string): string {
  return fileName.replace(/\.[^.]+$/, "") + "." + extension
}

function extensionForMime(mimeType?: string): string {
  switch ((mimeType || "").toLowerCase()) {
    case "image/jpeg":
      return "jpg"
    case "image/png":
      return "png"
    case "image/gif":
      return "gif"
    case "image/webp":
      return "webp"
    default:
      return "bin"
  }
}
