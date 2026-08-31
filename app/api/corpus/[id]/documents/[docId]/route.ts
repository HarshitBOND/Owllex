import { NextRequest, NextResponse } from "next/server"
import { objectIdSchema, requireUserContext } from "@/app/api/lib/routeGuards"
import { getPrivateSignedUrl } from "@/app/api/lib/storage/r2"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import CorpusDocument from "@/app/api/lib/models/corpus-document"
import { deleteCorpusVectors } from "@/app/api/lib/corpusBackend"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id, docId } = await params
  if (!objectIdSchema.safeParse(docId).success) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 })
  }

  await connectMongoWithRetry()
  const doc = await CorpusDocument.findOne({
    _id: docId,
    clerkUid: userContext.clerkUid,
    corpusId: id,
  }).lean<any>()
  if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 })

  const url = await getPrivateSignedUrl(doc.r2Key, 60 * 60)
  return NextResponse.json({ success: true, url, filename: doc.filename })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id, docId } = await params
  if (!objectIdSchema.safeParse(docId).success) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 })
  }

  await connectMongoWithRetry()
  const doc = await CorpusDocument.findOneAndDelete({
    _id: docId,
    clerkUid: userContext.clerkUid,
    corpusId: id,
  })
  if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 })

  await deleteCorpusVectors({ corpusId: id, clerkUid: userContext.clerkUid, documentId: doc.documentId })
  return NextResponse.json({ success: true })
}
