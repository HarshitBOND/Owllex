import { getBackendInternalHeaders } from "@/app/api/lib/backendInternalAuth"

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || "http://localhost:8000"

export type CompressResult = {
  stored: boolean
  r2_key?: string
  /** SHA-256 of the bytes actually written to R2, not of the upload. */
  sha256?: string
  original_bytes?: number
  stored_bytes?: number
  compressed?: boolean
}

/**
 * Hands a file to the backend to be recompressed and written to the private
 * bucket at `r2Key`.
 *
 * Ghostscript cannot run on Vercel, so this is how uploads that are stored but
 * never indexed (vault documents, attachments) get compressed. Unlike
 * extractDocumentText this runs no Docling pass, so it costs no OCR time.
 *
 * Never throws: a backend that is down or unconfigured resolves to
 * { stored: false } and the caller stores the original itself. Compression is
 * an optimization, and it must not be able to fail an upload.
 */
export async function compressAndStore(opts: {
  filename: string
  bytes: Buffer
  mimeType: string
  r2Key: string
}): Promise<CompressResult> {
  const form = new FormData()
  form.append("file", new File([new Uint8Array(opts.bytes)], opts.filename, { type: opts.mimeType }))
  form.append("r2_key", opts.r2Key)
  form.append("content_type", opts.mimeType)

  try {
    const response = await fetch(`${BACKEND_API}/api/v1/rag/documents/compress`, {
      method: "POST",
      headers: getBackendInternalHeaders(),
      body: form,
    })
    if (!response.ok) return { stored: false }
    const data = (await response.json()) as CompressResult
    return data.stored ? data : { stored: false }
  } catch {
    return { stored: false }
  }
}
