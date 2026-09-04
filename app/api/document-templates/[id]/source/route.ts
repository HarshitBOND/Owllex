import { NextRequest, NextResponse } from "next/server"
import { objectIdSchema, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DocumentTemplate from "@/app/api/lib/models/document-template"
import DocumentTemplateVersion from "@/app/api/lib/models/document-template-version"
import { getPrivateSignedUrl } from "@/app/api/lib/storage/r2"

/**
 * The court's original PDF, for any signed-in user.
 *
 * Reachable for archived templates as well as published ones, deliberately:
 * an advocate holding a draft made from a superseded form still needs to see
 * the form it came from. Only never-published drafts are withheld.
 */
const SIGNED_URL_TTL_SECONDS = 15 * 60

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  const requested = Number(new URL(request.url).searchParams.get("version"))

  await connectMongoWithRetry()

  const family = await DocumentTemplate.findById(id).select("status title").lean()
  if (!family || family.status === "draft") {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

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
      { success: false, error: "There is no court PDF behind this template." },
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
    })
  } catch {
    return NextResponse.json({ success: false, error: "Could not open the original form." }, { status: 502 })
  }
}
