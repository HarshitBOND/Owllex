import { NextRequest, NextResponse } from "next/server"
import { streamPrivateObject } from "@/app/api/lib/storage/hddStorage"

/**
 * GET /api/storage/public/<key>
 *
 * Serves the objects `putPublicObject` writes -- avatars and other images that
 * render for signed-out visitors and used to sit on R2's public bucket.
 *
 * These are readable without a session, so the route is narrow on purpose. It
 * can only ever address the `public/` prefix, which nothing but `putPublicObject`
 * writes to, and the key is rebuilt from Next's parsed path segments rather than
 * from the raw URL, so no amount of encoding in the request can steer it into
 * the private tree.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params
  const segments = (key || []).filter((segment) => segment && segment !== "." && segment !== "..")

  if (!segments.length || segments.length !== (key || []).length) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  const upstream = await streamPrivateObject(`public/${segments.join("/")}`)
  if (!upstream.ok) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
      // Content-addressed keys, so the bytes behind one never change.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
