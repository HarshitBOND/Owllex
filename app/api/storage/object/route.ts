import { NextRequest, NextResponse } from "next/server"
import { requireUserContext } from "@/app/api/lib/routeGuards"
import { streamPrivateObject, verifySignedObjectToken } from "@/app/api/lib/storage/hddStorage"

/**
 * GET /api/storage/object?k=...&e=...&a=...&s=...
 *
 * Redeems a signed URL minted by `getPrivateSignedUrl` and streams the object
 * off the backend volume. This is what replaced R2's presigned URLs, and it is
 * strictly stricter than they were:
 *
 *   * the signature is ours, so nothing outside this app can mint one;
 *   * a valid session is required on every request, so a link that escapes the
 *     app is useless to a logged-out stranger;
 *   * when the URL was bound to a user (`a=`), only that user can redeem it, so
 *     it is useless to a logged-in stranger too.
 *
 * The response passes `Range` through and returns whatever the backend answers,
 * so a browser's PDF viewer keeps seeking and never buffers a whole document.
 */
export async function GET(request: NextRequest) {
  const token = verifySignedObjectToken(request.nextUrl.searchParams)
  if (!token) {
    // One message for a bad signature, an expired link and a malformed key
    // alike: which of the three it was is information the caller has not earned.
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }

  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  if (token.boundTo && token.boundTo !== userContext.clerkUid) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }

  const upstream = await streamPrivateObject(token.key, request.headers.get("range"))
  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: upstream.status === 404 ? 404 : 502 }
    )
  }

  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  })
  for (const header of ["content-length", "content-range", "content-disposition"]) {
    const value = upstream.headers.get(header)
    if (value) headers.set(header, value)
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers })
}
