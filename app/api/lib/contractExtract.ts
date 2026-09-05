import { getBackendInternalHeaders } from "@/app/api/lib/backendInternalAuth"

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || "http://localhost:8000"

/** Kept under the callers' own maxDuration so the timeout is reported, not swallowed by the platform. */
const EXTRACT_TIMEOUT_MS = 240_000

export type ExtractResult = {
  success: true
  text: string
  /**
   * One entry per page, joined by the backend into `text`.
   *
   * Optional on purpose: an older backend that predates this field still works,
   * callers just lose page provenance rather than failing.
   */
  pages?: string[]
}

/**
 * Extracts a document's text. Extraction only -- this does not store anything.
 *
 * It used to accept an r2Key and let the backend archive the file as a side
 * effect, because Ghostscript could not run on Vercel. That made storage
 * depend on a service being reachable, and a backend that was down stored the
 * file full-size without saying so. Callers now compress with
 * app/api/lib/storage/compressPdf.ts and write to R2 themselves, so this call
 * has one job and no storage parameters to get wrong.
 */
export async function extractDocumentText(opts: {
  filename: string
  bytes: Buffer
  mimeType: string
  /** Defaults to "auto" (per-page text-layer detection) on the backend if omitted. */
  mode?: "auto" | "force_ocr" | "text_only"
}) {
  const form = new FormData()
  form.append("file", new File([new Uint8Array(opts.bytes)], opts.filename, { type: opts.mimeType }))
  if (opts.mode) {
    form.append("ocr_mode", opts.mode)
  }

  let response: Response
  try {
    response = await fetch(`${BACKEND_API}/api/v1/rag/documents/extract`, {
      method: "POST",
      headers: getBackendInternalHeaders(),
      body: form,
      // Without this the call can outlive the route's own maxDuration: the platform
      // then kills the function mid-flight and the browser gets a gateway error page
      // instead of JSON, which the page can only report as a connection failure.
      // Ending it here leaves time to answer with a real message.
      signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
    })
  } catch (cause) {
    if (cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError")) {
      throw new Error(
        `Document extraction timed out after ${Math.round(EXTRACT_TIMEOUT_MS / 1000)}s. ` +
          "The file may be too large or too scanned to OCR in one request -- try a smaller or text-based document.",
        { cause },
      )
    }
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
