import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/app/api/lib/adminMiddleware"
import { objectIdSchema } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DocumentTemplateVersion from "@/app/api/lib/models/document-template-version"
import { getPrivateSignedUrl } from "@/app/api/lib/storage/r2"

/**
 * Hands the admin a short-lived link to the court's original PDF, so the review
 * screen can show the source beside the reconstruction.
 *
 * Fifteen minutes: long enough to actually read a form against its extraction
 * without the iframe going dead part way through, short enough that a link
 * pasted somewhere is not a standing grant.
 */
const SIGNED_URL_TTL_SECONDS = 15 * 60

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request)
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 })
  }

  const requested = Number(new URL(request.url).searchParams.get("version"))

  await connectMongoWithRetry()

  const snapshot = await DocumentTemplateVersion.findOne(
    Number.isFinite(requested) && requested > 0
      ? { templateId: id, version: requested }
      : { templateId: id, "sourcePdf.r2Key": { $ne: null } }
  )
    .sort({ version: -1 })
    .select("sourcePdf version")
    .lean()

  if (!snapshot?.sourcePdf?.r2Key) {
    return NextResponse.json(
      { success: false, error: "This template was written by hand, so there is no court PDF behind it." },
      { status: 404 }
    )
  }

  try {
    const url = await getPrivateSignedUrl(snapshot.sourcePdf.r2Key, SIGNED_URL_TTL_SECONDS)
    return NextResponse.json({
      success: true,
      url,
      version: snapshot.version,
      filename: snapshot.sourcePdf.filename,
      pageCount: snapshot.sourcePdf.pageCount,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Could not sign the file link." },
      { status: 502 }
    )
  }
}
