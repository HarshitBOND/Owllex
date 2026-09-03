import { NextRequest, NextResponse } from "next/server"
import { objectIdSchema, requireUserContext } from "@/app/api/lib/routeGuards"
import { getPrivateSignedUrl } from "@/app/api/lib/storage/r2"
import { deleteIfUnreferenced } from "@/app/api/lib/storage/deleteIfUnreferenced"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import VaultDocument from "@/app/api/lib/models/vault-document"

export async function GET(request: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { docId } = await params
  if (!objectIdSchema.safeParse(docId).success) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 })
  }

  await connectMongoWithRetry()
  const doc = await VaultDocument.findOne({ _id: docId, clerkUid: userContext.clerkUid }).lean<any>()
  if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 })

  const url = await getPrivateSignedUrl(doc.r2Key, 5 * 60)
  return NextResponse.json({ success: true, url, filename: doc.filename })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { docId } = await params
  if (!objectIdSchema.safeParse(docId).success) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body.important !== "boolean") {
    return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 })
  }

  await connectMongoWithRetry()
  const doc = await VaultDocument.findOneAndUpdate(
    { _id: docId, clerkUid: userContext.clerkUid },
    { $set: { important: body.important } },
    { new: true }
  ).lean<any>()
  if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 })

  return NextResponse.json({ success: true, important: !!doc.important })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { docId } = await params
  if (!objectIdSchema.safeParse(docId).success) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 })
  }

  await connectMongoWithRetry()
  const doc = await VaultDocument.findOneAndDelete({ _id: docId, clerkUid: userContext.clerkUid })
  if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 })

  await deleteIfUnreferenced(doc.r2Key)
  return NextResponse.json({ success: true })
}
