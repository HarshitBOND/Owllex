import { getBackendInternalHeaders } from "@/app/api/lib/backendInternalAuth"

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

  const response = await fetch(`${BACKEND_API}/api/v1/rag/corpus/ingest`, {
    method: "POST",
    headers: getBackendInternalHeaders(),
    body: form,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : data.detail?.message
    throw new Error(detail || "Indexing failed")
  }
  return data as { document_id: string; chunk_count: number }
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
