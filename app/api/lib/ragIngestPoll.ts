import { getBackendInternalHeaders } from "@/app/api/lib/backendInternalAuth"

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || "http://localhost:8000"

/**
 * The backend's async ingest contract (see PRODUCTION_TODO.md T2): POST
 * /ingest or /corpus/ingest enqueues the file with the ingest worker -- the
 * sole FAISS writer -- and returns {job_id, status:"queued"} immediately.
 * This polls GET /jobs/{job_id} until it reaches a terminal status, turning
 * that back into the synchronous result callers here had before.
 */
export interface IngestJobResult {
  job_id: string
  status: "queued" | "processing" | "complete" | "duplicate" | "failed"
  filename?: string
  document_id?: string | null
  error?: string | null
  chunk_count?: number
  page_count?: number
  content_hash?: string
  title?: string
  document_type?: string
  date?: string
  court?: string
  citation?: string
  storage_ref?: string
  source_url?: string
  [key: string]: unknown
}

const TERMINAL_STATUSES = new Set(["complete", "duplicate", "failed"])

export async function pollIngestJob(
  jobId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<IngestJobResult> {
  // OCR-heavy multi-page documents can take minutes; the gunicorn worker
  // timeout on the backend is 300s per document, so this stays a bit above it.
  const timeoutMs = opts.timeoutMs ?? 6 * 60 * 1000
  const intervalMs = opts.intervalMs ?? 2000
  const deadline = Date.now() + timeoutMs

  while (true) {
    const response = await fetch(`${BACKEND_API}/api/v1/rag/jobs/${jobId}`, {
      headers: getBackendInternalHeaders(),
    })
    if (response.status === 404) {
      throw new Error(`Ingest job ${jobId} not found`)
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const detail = typeof data.detail === "string" ? data.detail : data.detail?.message
      throw new Error(detail || `Ingest job lookup failed (HTTP ${response.status})`)
    }

    if (TERMINAL_STATUSES.has(data.status)) {
      return data as IngestJobResult
    }

    if (Date.now() > deadline) {
      throw new Error(`Ingest job ${jobId} did not finish within ${Math.round(timeoutMs / 1000)}s`)
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

/** POST an enqueue request, then poll its job_id to a terminal result. */
export async function enqueueAndAwaitIngest(
  url: string,
  formData: FormData,
  pollOpts?: { timeoutMs?: number; intervalMs?: number },
): Promise<IngestJobResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: getBackendInternalHeaders(),
    body: formData,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : data.detail?.message
    throw new Error(detail || "Could not enqueue ingestion")
  }
  return pollIngestJob(data.job_id, pollOpts)
}
