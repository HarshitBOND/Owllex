export type UploadValidation = {
  ok: boolean
  error?: string
  resourceType?: "image" | "raw"
  sanitizedFileName?: string
}

type UploadResourceType = "image" | "raw"

const IMAGE_SIGNATURES: Array<{ type: UploadResourceType; magic: number[] }> = [
  { type: "image", magic: [0xff, 0xd8, 0xff] },
  { type: "image", magic: [0x89, 0x50, 0x4e, 0x47] },
  { type: "image", magic: [0x47, 0x49, 0x46, 0x38] },
  { type: "image", magic: [0x52, 0x49, 0x46, 0x46] },
]

const RAW_SIGNATURES: Array<{ type: UploadResourceType; magic: number[] }> = [
  { type: "raw", magic: [0x25, 0x50, 0x44, 0x46] },
  { type: "raw", magic: [0x50, 0x4b, 0x03, 0x04] },
]

const ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "pdf",
  "docx",
  "txt",
  "md",
])

const DANGEROUS_EXTENSIONS = new Set([
  "exe",
  "dll",
  "bat",
  "cmd",
  "ps1",
  "sh",
  "js",
  "mjs",
  "cjs",
  "jar",
  "msi",
  "com",
  "scr",
  "vbs",
  "hta",
  "reg",
])

const ALLOWED_MIME_BY_EXTENSION: Record<string, string[]> = {
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  gif: ["image/gif"],
  webp: ["image/webp"],
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  txt: ["text/plain"],
  md: ["text/markdown", "text/plain"],
}

const RESOURCE_TYPE_BY_EXTENSION: Record<string, UploadResourceType> = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  pdf: "raw",
  docx: "raw",
  txt: "raw",
  md: "raw",
}

function bytesMatch(bytes: Uint8Array, magic: number[]) {
  if (bytes.length < magic.length) {
    return false
  }

  return magic.every((value, index) => bytes[index] === value)
}

function getExtension(fileName: string) {
  const parts = fileName.toLowerCase().split(".")
  return parts.length > 1 ? parts.pop() || "" : ""
}

export function sanitizeFileName(fileName: string) {
  const baseName = fileName
    .replace(/[\\/]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
    .replace(/[^a-zA-Z0-9._ -]/g, "_")

  return baseName || `upload-${Date.now()}`
}

function hasDoubleExtension(fileName: string) {
  const normalized = fileName.toLowerCase().replace(/\s+/g, "")
  const segments = normalized.split(".").filter(Boolean)

  if (segments.length <= 2) {
    return false
  }

  return segments.slice(0, -1).some((segment) => DANGEROUS_EXTENSIONS.has(segment))
}

export function validateUploadBuffer(fileName: string, bytes: Uint8Array, mimeType?: string): UploadValidation {
  const sanitizedFileName = sanitizeFileName(fileName)
  const extension = getExtension(sanitizedFileName)

  if (hasDoubleExtension(sanitizedFileName)) {
    return { ok: false, error: "Suspicious file name", sanitizedFileName }
  }

  if (DANGEROUS_EXTENSIONS.has(extension)) {
    return { ok: false, error: "Dangerous file type is not allowed", sanitizedFileName }
  }

  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
    return { ok: false, error: "Unsupported file extension", sanitizedFileName }
  }

  const normalizedMime = (mimeType || "").trim().toLowerCase()
  const allowedMimes = ALLOWED_MIME_BY_EXTENSION[extension] || []
  if (normalizedMime && allowedMimes.length > 0 && !allowedMimes.includes(normalizedMime)) {
    return { ok: false, error: "MIME type does not match file extension", sanitizedFileName }
  }

  if (extension === "txt" || extension === "md") {
    return { ok: true, resourceType: "raw", sanitizedFileName }
  }

  const signatures = [...IMAGE_SIGNATURES, ...RAW_SIGNATURES]
  const match = signatures.find((sig) => bytesMatch(bytes, sig.magic))

  if (!match) {
    return { ok: false, error: "Invalid file signature", sanitizedFileName }
  }

  if (extension === "webp") {
    if (bytes.length < 12 || !bytesMatch(bytes.slice(8, 12), [0x57, 0x45, 0x42, 0x50])) {
      return { ok: false, error: "Invalid WebP signature", sanitizedFileName }
    }
  }

  const expectedResourceType = RESOURCE_TYPE_BY_EXTENSION[extension]
  if (match.type !== expectedResourceType) {
    return { ok: false, error: "File signature does not match extension", sanitizedFileName }
  }

  return { ok: true, resourceType: match.type, sanitizedFileName }
}
