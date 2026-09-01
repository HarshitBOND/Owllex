import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, requireUserContext } from "@/app/api/lib/routeGuards"
import { validateUploadBuffer } from "@/app/api/lib/uploadValidation"
import { logSecurityEvent } from "@/app/api/lib/securityLogger"
import { putPrivateObject } from "@/app/api/lib/storage/r2"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import Corpus from "@/app/api/lib/models/corpus"
import CorpusDocument from "@/app/api/lib/models/corpus-document"
import { ingestCorpusDocument } from "@/app/api/lib/corpusBackend"
import { getAiUsage, countCorpusDoc } from "@/app/api/lib/services/aiUsage"

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024
const MAX_DOCS_PER_CORPUS = 50
const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt", "md", "jpg", "jpeg", "png"])

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  await connectMongoWithRetry()
  const rows = await CorpusDocument.find({ clerkUid: userContext.clerkUid, corpusId: id })
    .sort({ createdAt: -1 })
    .lean<any[]>()

  return NextResponse.json({
    success: true,
    documents: rows.map((d) => ({
      id: String(d._id),
      filename: d.filename,
      mimeType: d.mimeType,
      size: d.size,
      status: d.status,
      chunkCount: d.chunkCount,
      error: d.error,
      createdAt: new Date(d.createdAt).getTime(),
    })),
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `corpus:upload:${userContext.clerkUid}`,
    max: 40,
    windowMs: 10 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  const { id } = await params
  await connectMongoWithRetry()
  const corpus = await Corpus.findOne({ clerkUid: userContext.clerkUid, corpusId: id }).lean<any>()
  if (!corpus) return NextResponse.json({ success: false, error: "Corpus not found" }, { status: 404 })

  const existing = await CorpusDocument.countDocuments({ clerkUid: userContext.clerkUid, corpusId: id })
  if (existing >= MAX_DOCS_PER_CORPUS) {
    return NextResponse.json(
      { success: false, error: `A corpus can hold at most ${MAX_DOCS_PER_CORPUS} documents` },
      { status: 400 }
    )
  }

  const usage = await getAiUsage(userContext.clerkUid)
  if (!usage || !usage.isActive) {
    return NextResponse.json(
      { success: false, error: "Your subscription is not active. Renew to upload documents." },
      { status: 403 }
    )
  }
  if (usage.corpusDocsUsed >= usage.caps.corpusDocsPerMonth) {
    return NextResponse.json(
      {
        success: false,
        error:
          usage.caps.corpusDocsPerMonth === 0
            ? "Document indexing is not available on the free plan. Upgrade to use it."
            : `You've indexed ${usage.corpusDocsUsed} of ${usage.caps.corpusDocsPerMonth} documents allowed this month. Upgrade for more.`,
      },
      { status: 429 }
    )
  }

  const formData = await request.formData()
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ success: false, error: "File exceeds the 25MB limit" }, { status: 400 })
  }

  const buffer = new Uint8Array(await file.arrayBuffer())
  const validation = validateUploadBuffer(file.name, buffer, file.type)
  const extension = validation.sanitizedFileName?.split(".").pop()?.toLowerCase() || ""
  const resourceOk = validation.resourceType === "raw" || validation.resourceType === "image"

  if (!validation.ok || !resourceOk || !ALLOWED_EXTENSIONS.has(extension)) {
    logSecurityEvent({
      type: "upload_failed",
      level: "warn",
      message: "Corpus document upload rejected by validation",
      request,
      userId: userContext.clerkUid,
      details: { reason: validation.error, originalFileName: file.name, mimeType: file.type },
    })
    return NextResponse.json(
      { success: false, error: "Only PDF, DOCX, TXT, MD, JPG, or PNG files are supported" },
      { status: 400 }
    )
  }

  const filename = validation.sanitizedFileName!
  const documentId = randomUUID().replace(/-/g, "")
  const r2Key = `${userContext.clerkUid}/corpus/${id}/${documentId}-${filename}`

  await putPrivateObject(r2Key, Buffer.from(buffer), file.type || "application/octet-stream")

  const doc = await CorpusDocument.create({
    clerkUid: userContext.clerkUid,
    corpusId: id,
    documentId,
    filename,
    mimeType: file.type || "application/octet-stream",
    size: buffer.byteLength,
    r2Key,
    status: "indexing",
  })

  try {
    const result = await ingestCorpusDocument({
      corpusId: id,
      clerkUid: userContext.clerkUid,
      documentId,
      filename,
      bytes: Buffer.from(buffer),
      mimeType: file.type || "application/octet-stream",
    })
    doc.status = "ready"
    doc.chunkCount = result.chunk_count ?? 0
    await doc.save()
    await countCorpusDoc(userContext.clerkUid)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Indexing failed"
    console.error("[CORPUS] ingest failed:", message)
    doc.status = "failed"
    doc.error = message
    await doc.save()

    return NextResponse.json({
      success: true,
      warning: `Saved, but not indexed: ${message}. The assistant can still use this corpus, it just cannot quote this file.`,
      document: {
        id: String(doc._id),
        filename: doc.filename,
        mimeType: doc.mimeType,
        size: doc.size,
        status: doc.status,
        chunkCount: 0,
        error: message,
        createdAt: new Date(doc.createdAt).getTime(),
      },
    })
  }

  return NextResponse.json({
    success: true,
    document: {
      id: String(doc._id),
      filename: doc.filename,
      mimeType: doc.mimeType,
      size: doc.size,
      status: doc.status,
      chunkCount: doc.chunkCount,
      error: "",
      createdAt: new Date(doc.createdAt).getTime(),
    },
  })
}
