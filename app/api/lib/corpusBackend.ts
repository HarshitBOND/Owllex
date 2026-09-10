import { getBackendInternalHeaders } from "@/app/api/lib/backendInternalAuth"
import { enqueueAndAwaitIngest } from "@/app/api/lib/ragIngestPoll"

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || "http://localhost:8000"

export async function ingestCorpusDocument(opts: {
  corpusId: string
  clerkUid: string
  documentId: string
  filename: string
  bytes: Buffer
  mimeType: string
}) {
  const form = new FormData()
  form.append("corpus_id", opts.corpusId)
  form.append("clerk_uid", opts.clerkUid)
  form.append("document_id", opts.documentId)
  form.append("files", new File([new Uint8Array(opts.bytes)], opts.filename, { type: opts.mimeType }))

  // The backend enqueues onto the ingest worker (the sole FAISS writer) and
  // returns a job_id immediately; this waits for it the way callers here
  // always could, since none of them poll for progress themselves.
  const job = await enqueueAndAwaitIngest(`${BACKEND_API}/api/v1/rag/corpus/ingest`, form)

  if (job.status === "failed") {
    throw new Error(job.error || "Indexing failed")
  }
  if (job.status === "duplicate") {
    // Matches the shape the backend used to return inline for a duplicate:
    // a soft success, not an error -- the file is already indexed.
    return { document_id: job.document_id as string, chunk_count: 0, duplicate: true }
  }
  return { document_id: job.document_id as string, chunk_count: job.chunk_count ?? 0 }
}

export async function searchCorpus(opts: {
  corpusId: string
  clerkUid: string
  query: string
  k: number
}) {
  const response = await fetch(`${BACKEND_API}/api/v1/rag/corpus/search`, {
    method: "POST",
    headers: { ...getBackendInternalHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      corpus_id: opts.corpusId,
      clerk_uid: opts.clerkUid,
      query: opts.query,
      k: opts.k,
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : data.detail?.message
    throw new Error(detail || "Corpus search failed")
  }
  return data as {
    results: { text: string; score: number; document_id: string; title?: string; source_url?: string }[]
  }
}

export async function deleteCorpusVectors(opts: { corpusId: string; clerkUid: string; documentId?: string }) {
  try {
    await fetch(`${BACKEND_API}/api/v1/rag/corpus/delete`, {
      method: "POST",
      headers: { ...getBackendInternalHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        corpus_id: opts.corpusId,
        clerk_uid: opts.clerkUid,
        document_id: opts.documentId ?? null,
      }),
    })
  } catch (error) {
    console.error("[CORPUS] vector cleanup failed:", error)
  }
}
