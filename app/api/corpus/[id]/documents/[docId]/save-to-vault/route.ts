import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, objectIdSchema, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import CorpusDocument from "@/app/api/lib/models/corpus-document"
import { copyObjectToVault } from "@/app/api/lib/vault/copyToVault"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `vault:save:corpus:${userContext.clerkUid}`,
    max: 40,
    windowMs: 10 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  const { id, docId } = await params
  if (!objectIdSchema.safeParse(docId).success) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 })
  }

  await connectMongoWithRetry()
  const doc = await CorpusDocument.findOne({
    _id: docId,
    corpusId: id,
    clerkUid: userContext.clerkUid,
  }).lean<any>()
  if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 })

  const result = await copyObjectToVault({
    clerkUid: userContext.clerkUid,
    sourceR2Key: doc.r2Key,
    filename: doc.filename,
    mimeType: doc.mimeType,
    // The corpus upload already compressed this object. Re-running the lossy
    // image pass here would soften it a second time for almost no gain.
    alreadyCompressed: doc.compressionStatus === "compressed",
  })

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true, alreadyInVault: result.alreadyInVault, document: result.document })
}
