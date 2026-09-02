import { getBackendInternalHeaders } from "@/app/api/lib/backendInternalAuth"

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || "http://localhost:8000"

export type ExtractResult = {
  success: true
  text: string
  /** Present only when r2Key was supplied and the backend completed the write. */
  stored?: boolean
  r2_key?: string
  original_bytes?: number
  stored_bytes?: number
  compressed?: boolean
}

/**
 * Extracts a document's text, optionally handing the backend the private-bucket
 * key to archive it under.
 *
 * Passing r2Key makes the backend do the R2 write, which is the only way these
 * uploads get a Ghostscript pass -- that binary cannot run on Vercel, and the
 * file is already being shipped here for extraction, so it costs no extra
 * transfer. Callers must still handle stored !== true by uploading the original
 * themselves.
 */
export async function extractDocumentText(opts: {
  filename: string
  bytes: Buffer
  mimeType: string
  r2Key?: string
}) {
  const form = new FormData()
  form.append("file", new File([new Uint8Array(opts.bytes)], opts.filename, { type: opts.mimeType }))
  if (opts.r2Key) {
    form.append("r2_key", opts.r2Key)
    form.append("content_type", opts.mimeType)
  }

  let response: Response
  try {
    response = await fetch(`${BACKEND_API}/api/v1/rag/documents/extract`, {
      method: "POST",
      headers: getBackendInternalHeaders(),
      body: form,
    })
  } catch (cause) {
    // fetch() rejects rather than returning a status when the backend is unreachable, and its
    // message is a bare "fetch failed" -- which is what the caller ends up showing the user on
    // the 502. Name the service and the URL so the usual cause (backend not started) is obvious.
    throw new Error(
      `Document extraction service is unreachable at ${BACKEND_API}. Is the Python backend running?`,
      { cause },
    )
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : data.detail?.message
    throw new Error(detail || "Document extraction failed")
  }
  return data as ExtractResult
}
