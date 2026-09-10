/**
 * GET /api/documents/view?token=...
 * Serves a public judgment/law PDF through a single-owner, short-lived access
 * token instead of a permanent unauthenticated URL -- the AI chat mints one of
 * these per citation (see app/api/lib/judgmentsBackend.ts) so a copied link
 * fails for anyone but the requesting user, and stops working once the token
 * expires.
 *
 * The corpus lives on the backend's mounted volume, so the bytes are streamed
 * from the backend rather than redirected to a presigned URL. The R2 fallback
 * that used to sit behind this is gone along with the bucket: a document with no
 * archived file is now a 404, which is the honest answer, and the migration
 * (backend/rag/scripts/migrate_r2_documents.py) is what stops it from being the
 * answer for anything a user can still reach.
 *
 * Range headers are passed through, so the browser's PDF viewer can seek inside
 * a long judgment instead of downloading it whole.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DocumentAccessToken from "@/app/api/lib/models/document-access-token"
import PublicDocument from "@/app/api/lib/models/public-document"
import { getBackendInternalHeaders } from "@/app/api/lib/backendInternalAuth"

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || "http://localhost:8000"

export async function GET(request: NextRequest) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const token = request.nextUrl.searchParams.get("token")
  if (!token) {
    return NextResponse.json({ success: false, error: "Missing token" }, { status: 400 })
  }

  await connectMongoWithRetry()

  const record = await DocumentAccessToken.findOne({ token })
  if (!record || record.expiresAt.getTime() < Date.now() || record.clerkUid !== userContext.clerkUid) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }

  const doc = await PublicDocument.findOne({ documentId: record.documentId })
  if (!doc) {
    return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 })
  }

  return streamFromBackend(record.documentId, request.headers.get("range"))
}

/** Streams the archived corpus document off the backend volume. */
async function streamFromBackend(
  documentId: string,
  range: string | null
): Promise<NextResponse> {
  let upstream: Response
  try {
    upstream = await fetch(
      `${BACKEND_API}/api/v1/rag/documents/${encodeURIComponent(documentId)}/file`,
      {
        headers: { ...getBackendInternalHeaders(), ...(range ? { Range: range } : {}) },
        cache: "no-store",
      }
    )
  } catch (error) {
    // The volume is the only copy now, so an unreachable backend is a genuine
    // outage rather than a reason to try somewhere else. 503 says so, and says
    // it is worth retrying -- which a 404 would not.
    console.error("[DOCUMENTS] backend file fetch failed:", error)
    return NextResponse.json(
      { success: false, error: "Document storage is temporarily unavailable" },
      { status: 503 }
    )
  }

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { success: false, error: "Document not found" },
      { status: upstream.status === 404 ? 404 : 502 }
    )
  }

  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") || "application/pdf",
    "Content-Disposition": upstream.headers.get("content-disposition") || "inline",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  })
  for (const header of ["content-length", "content-range"]) {
    const value = upstream.headers.get(header)
    if (value) headers.set(header, value)
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers })
}
