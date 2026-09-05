import { NextRequest, NextResponse } from "next/server"
import { objectIdSchema, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DraftDocument from "@/app/api/lib/models/draft-document"
import { revertToRevision, type RevisableDoc } from "@/app/api/lib/services/revise"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; revisionId: string }> },
) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id, revisionId } = await params
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  await connectMongoWithRetry()
  const draft = await DraftDocument.findOne({ _id: id, clerkUid: userContext.clerkUid })
  if (!draft) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  const outcome = revertToRevision(draft as unknown as RevisableDoc, revisionId)
  if (!outcome.ok) {
    return NextResponse.json({ success: false, error: outcome.error }, { status: 409 })
  }
  await draft.save()

  return NextResponse.json({
    success: true,
    contentHtml: draft.contentHtml,
    revisions: draft.revisions,
    version: draft.version,
  })
}
