import crypto from "crypto"
import { getBackendInternalHeaders } from "@/app/api/lib/backendInternalAuth"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DocumentAccessToken from "@/app/api/lib/models/document-access-token"

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || "http://localhost:8000"
const TOKEN_TTL_SECONDS = 20 * 60

export type JudgmentHit = {
  title: string
  text: string
  viewerUrl: string
}

export async function searchJudgments(opts: {
  clerkUid: string
  query: string
  k: number
}): Promise<{ results: JudgmentHit[] }> {
  const response = await fetch(`${BACKEND_API}/api/v1/rag/judgments/search`, {
    method: "POST",
    headers: { ...getBackendInternalHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ query: opts.query, k: opts.k }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : data.detail?.message
    throw new Error(detail || "Judgment search failed")
  }

  const hits = (data.results ?? []) as {
    text: string
    title?: string
    document_id?: string
    storage_ref?: string
  }[]

  await connectMongoWithRetry()

  const results = await Promise.all(
    hits
      .filter((hit) => hit.document_id && hit.storage_ref)
      .map(async (hit) => {
        const token = crypto.randomBytes(32).toString("hex")
        await DocumentAccessToken.create({
          token,
          documentId: hit.document_id,
          clerkUid: opts.clerkUid,
          expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000),
        })
        return {
          title: hit.title || "Untitled document",
          text: hit.text,
          viewerUrl: `/api/documents/view?token=${token}`,
        }
      }),
  )

  return { results }
}
