import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import { deleteIfUnreferenced } from "@/app/api/lib/storage/deleteIfUnreferenced"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import Corpus from "@/app/api/lib/models/corpus"
import CorpusDocument from "@/app/api/lib/models/corpus-document"
import Conversation from "@/app/api/lib/models/conversation"
import Case from "@/app/api/lib/models/case"
import Client from "@/app/api/lib/models/client"
import { CASE_FIELDS, CLIENT_FIELDS } from "@/lib/ai/corpus-match"
import { deleteCorpusVectors } from "@/app/api/lib/corpusBackend"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  await connectMongoWithRetry()
  const corpus = await Corpus.findOne({ clerkUid: userContext.clerkUid, corpusId: id }).lean<any>()
  if (!corpus) return NextResponse.json({ success: false, error: "Corpus not found" }, { status: 404 })

  const cases = await Case.find({ _id: { $in: corpus.caseIds ?? [] } }).select(CASE_FIELDS).lean()
  const clients = await Client.find({ _id: { $in: corpus.clientIds ?? [] } }).select(CLIENT_FIELDS).lean()
  const documents = await CorpusDocument.find({ clerkUid: userContext.clerkUid, corpusId: id })
    .sort({ createdAt: -1 })
    .lean<any[]>()

  return NextResponse.json({
    success: true,
    corpus: {
      id: corpus.corpusId,
      name: corpus.name,
      description: corpus.description,
      instructions: corpus.instructions,
      accent: corpus.accent,
      archived: corpus.archived,
      createdAt: new Date(corpus.createdAt).getTime(),
      updatedAt: new Date(corpus.updatedAt).getTime(),
      cases,
      clients,
      documents: documents.map((d) => ({
        id: String(d._id),
        filename: d.filename,
        mimeType: d.mimeType,
        size: d.size,
        status: d.status,
        chunkCount: d.chunkCount,
        error: d.error,
        createdAt: new Date(d.createdAt).getTime(),
      })),
    },
  })
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  instructions: z.string().max(4000).optional(),
  description: z.string().max(4000).optional(),
  archived: z.boolean().optional(),
  caseIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(100).optional(),
  clientIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(100).optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const parsed = await parseAndValidateJson(request, patchSchema)
  if (!parsed.success) return parsed.response

  const { id } = await params
  await connectMongoWithRetry()
  const updated = await Corpus.findOneAndUpdate(
    { clerkUid: userContext.clerkUid, corpusId: id },
    { $set: parsed.data },
    { new: true }
  ).lean<any>()

  if (!updated) return NextResponse.json({ success: false, error: "Corpus not found" }, { status: 404 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  await connectMongoWithRetry()
  const corpus = await Corpus.findOneAndDelete({ clerkUid: userContext.clerkUid, corpusId: id })
  if (!corpus) return NextResponse.json({ success: false, error: "Corpus not found" }, { status: 404 })

  // Collect the storage keys before the rows go, or the objects they point at
  // become unreachable orphans -- deleteMany used to drop every document in the
  // corpus and leave the whole set behind in R2.
  const docs = await CorpusDocument.find({ clerkUid: userContext.clerkUid, corpusId: id })
    .select("r2Key")
    .lean<{ r2Key: string }[]>()
  await CorpusDocument.deleteMany({ clerkUid: userContext.clerkUid, corpusId: id })
  await Promise.all(docs.map((d) => deleteIfUnreferenced(d.r2Key).catch(() => {})))
  await Conversation.updateMany(
    { clerkUid: userContext.clerkUid, corpusId: id },
    { $set: { corpusId: null } }
  )
  await deleteCorpusVectors({ corpusId: id, clerkUid: userContext.clerkUid })

  return NextResponse.json({ success: true })
}
