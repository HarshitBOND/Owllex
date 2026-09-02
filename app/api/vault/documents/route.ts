import { createHash } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, requireUserContext } from "@/app/api/lib/routeGuards"
import { validateUploadBuffer } from "@/app/api/lib/uploadValidation"
import { logSecurityEvent } from "@/app/api/lib/securityLogger"
import { optimizeImage, withExtension } from "@/app/api/lib/storage/optimizeImage"
import { compressAndStore } from "@/app/api/lib/storage/compressAndStore"
import { headPrivateObject, putPrivateObject } from "@/app/api/lib/storage/r2"
import { contentAddressedKey } from "@/app/api/lib/storage/dedupe"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import VaultDocument from "@/app/api/lib/models/vault-document"

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024
const MAX_DOCS_PER_VAULT = 200
const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt", "md", "jpg", "jpeg", "png", "gif", "webp"])

export async function GET(request: NextRequest) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  await connectMongoWithRetry()
  const rows = await VaultDocument.find({ clerkUid: userContext.clerkUid })
    .sort({ createdAt: -1 })
    .lean<any[]>()

  return NextResponse.json({
    success: true,
    documents: rows.map((d) => ({
      id: String(d._id),
      filename: d.filename,
      mimeType: d.mimeType,
      size: d.size,
      sha256: d.sha256,
      verifyStatus: d.verifyStatus,
      lastVerifiedAt: d.lastVerifiedAt ? new Date(d.lastVerifiedAt).getTime() : 0,
      createdAt: new Date(d.createdAt).getTime(),
    })),
  })
}

export async function POST(request: NextRequest) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `vault:upload:${userContext.clerkUid}`,
    max: 40,
    windowMs: 10 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  await connectMongoWithRetry()
  const existing = await VaultDocument.countDocuments({ clerkUid: userContext.clerkUid })
  if (existing >= MAX_DOCS_PER_VAULT) {
    return NextResponse.json(
      { success: false, error: `Your vault can hold at most ${MAX_DOCS_PER_VAULT} documents` },
      { status: 400 }
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

  if (!validation.ok || !ALLOWED_EXTENSIONS.has(extension)) {
    logSecurityEvent({
      type: "upload_failed",
      level: "warn",
      message: "Vault document upload rejected by validation",
      request,
      userId: userContext.clerkUid,
      details: { reason: validation.error, originalFileName: file.name, mimeType: file.type },
    })
    return NextResponse.json(
      { success: false, error: "Only PDF, DOCX, TXT, MD, JPG, PNG, GIF, or WEBP files are supported" },
      { status: 400 }
    )
  }

  const mimeType = file.type || "application/octet-stream"
  const originalSha256 = createHash("sha256").update(buffer).digest("hex")

  // Images are downscaled here; PDFs go to the backend for a Ghostscript pass.
  const isImage = validation.resourceType === "image"
  const optimized = isImage ? await optimizeImage(Buffer.from(buffer), mimeType) : null

  const filename = optimized
    ? withExtension(validation.sanitizedFileName!, optimized.extension)
    : validation.sanitizedFileName!
  const { key: r2Key, exists } = await contentAddressedKey({
    prefix: `${userContext.clerkUid}/vault`,
    bytes: buffer,
    filename,
  })

  let storedBytes = buffer.byteLength
  let storedMime = mimeType
  // sha256 must describe the bytes that end up in R2, not the upload -- it is
  // what the verify endpoint re-checks, and compression changes them.
  let sha256 = originalSha256

  if (exists) {
    // Same user, same bytes, key already populated -- reuse the stored object.
    // The hash is recomputed from what is actually in R2 so verify still works.
    const head = await headPrivateObject(r2Key)
    storedBytes = head.contentLength ?? storedBytes
    if (optimized) {
      storedMime = optimized.contentType
      sha256 = createHash("sha256").update(optimized.buffer).digest("hex")
    }
  } else if (optimized) {
    await putPrivateObject(r2Key, optimized.buffer, optimized.contentType)
    storedBytes = optimized.storedBytes
    storedMime = optimized.contentType
    sha256 = createHash("sha256").update(optimized.buffer).digest("hex")
  } else {
    const result = await compressAndStore({
      filename: validation.sanitizedFileName!,
      bytes: Buffer.from(buffer),
      mimeType,
      r2Key,
    })
    if (result.stored && result.sha256) {
      storedBytes = result.stored_bytes ?? storedBytes
      sha256 = result.sha256
    } else {
      // Backend unavailable or declined -- store the original from here so an
      // upload never depends on the compression service being up.
      await putPrivateObject(r2Key, Buffer.from(buffer), mimeType)
    }
  }

  const doc = await VaultDocument.create({
    clerkUid: userContext.clerkUid,
    filename,
    mimeType: storedMime,
    size: storedBytes,
    r2Key,
    sha256,
    originalSha256,
    originalSize: buffer.byteLength,
    verifyStatus: "verified",
    lastVerifiedAt: new Date(),
  })

  return NextResponse.json({
    success: true,
    document: {
      id: String(doc._id),
      filename: doc.filename,
      mimeType: doc.mimeType,
      size: doc.size,
      sha256: doc.sha256,
      verifyStatus: doc.verifyStatus,
      lastVerifiedAt: doc.lastVerifiedAt.getTime(),
      createdAt: doc.createdAt.getTime(),
    },
  })
}
