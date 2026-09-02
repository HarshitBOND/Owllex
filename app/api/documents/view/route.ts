/**
 * GET /api/documents/view?token=...
 * Serves a public judgment/law PDF through a single-owner, short-lived access
 * token instead of the permanent unauthenticated doc.ravenslaw.com URL -- the
 * AI chat mints one of these per citation (see app/api/lib/judgmentsBackend.ts)
 * so a copied link fails for anyone but the requesting user, and stops working
 * once the token expires.
 *
 * The token is validated here and the client is then redirected straight to a
 * 60s presigned R2 URL. Streaming the bytes back through this route instead
 * paid for the same PDF twice -- R2 egress plus Vercel egress -- and held a
 * lambda open for the whole transfer. The redirect keeps the identical access
 * check; only the bytes take a shorter path.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DocumentAccessToken from "@/app/api/lib/models/document-access-token"
import PublicDocument from "@/app/api/lib/models/public-document"
import { getPrivateSignedUrl } from "@/app/api/lib/storage/r2"

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

  const signedUrl = await getPrivateSignedUrl(doc.storageRef, 60)

  // 302 rather than 307/308: this is a one-off location for a GET, and the
  // no-store keeps the signed URL out of any shared cache once it expires.
  return NextResponse.redirect(signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, no-store" },
  })
}
