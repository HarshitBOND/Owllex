import { NextRequest, NextResponse } from "next/server"
import { objectIdSchema, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import ContractReview from "@/app/api/lib/models/contract-review"
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
  const review = await ContractReview.findOne({ _id: id, clerkUid: userContext.clerkUid })
  if (!review) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  const outcome = revertToRevision(review as unknown as RevisableDoc, revisionId)
  if (!outcome.ok) {
    return NextResponse.json({ success: false, error: outcome.error }, { status: 409 })
  }
  await review.save()

  return NextResponse.json({
    success: true,
    contentHtml: review.contentHtml,
    revisions: review.revisions,
    version: review.version,
  })
}
