import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, objectIdSchema, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import ContractReview from "@/app/api/lib/models/contract-review"
import { copyObjectToVault } from "@/app/api/lib/vault/copyToVault"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `vault:save:contract-review:${userContext.clerkUid}`,
    max: 40,
    windowMs: 10 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  const { id } = await params
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 })
  }

  await connectMongoWithRetry()
  const review = await ContractReview.findOne({ _id: id, clerkUid: userContext.clerkUid }).lean<any>()
  if (!review) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 })

  const result = await copyObjectToVault({
    clerkUid: userContext.clerkUid,
    sourceR2Key: review.r2Key,
    filename: review.fileName,
    mimeType: review.mimeType,
  })

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true, alreadyInVault: result.alreadyInVault, document: result.document })
}
