import { getBackendInternalHeaders } from "@/app/api/lib/backendInternalAuth"

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || "http://localhost:8000"

export async function extractDocumentText(opts: { filename: string; bytes: Buffer; mimeType: string }) {
  const form = new FormData()
  form.append("file", new File([new Uint8Array(opts.bytes)], opts.filename, { type: opts.mimeType }))

  const response = await fetch(`${BACKEND_API}/api/v1/rag/documents/extract`, {
    method: "POST",
    headers: getBackendInternalHeaders(),
    body: form,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : data.detail?.message
    throw new Error(detail || "Document extraction failed")
  }
  return data as { success: true; text: string }
}
