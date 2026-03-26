export type UploadValidation = {
  ok: boolean
  error?: string
  resourceType?: "image" | "raw"
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

export function validateUploadBuffer(fileName: string, bytes: Uint8Array): UploadValidation {
  const extension = getExtension(fileName)
  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
    return { ok: false, error: "Unsupported file extension" }
  }

  if (extension === "txt" || extension === "md") {
    return { ok: true, resourceType: "raw" }
  }

  const signatures = [...IMAGE_SIGNATURES, ...RAW_SIGNATURES]
  const match = signatures.find((sig) => bytesMatch(bytes, sig.magic))

  if (!match) {
    return { ok: false, error: "Invalid file signature" }
  }

  if (extension === "webp") {
    if (bytes.length < 12 || !bytesMatch(bytes.slice(8, 12), [0x57, 0x45, 0x42, 0x50])) {
      return { ok: false, error: "Invalid WebP signature" }
    }
  }

  return { ok: true, resourceType: match.type }
}
