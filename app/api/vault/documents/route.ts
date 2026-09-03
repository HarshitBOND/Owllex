import { createHash } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, requireUserContext } from "@/app/api/lib/routeGuards"
import { validateUploadBuffer } from "@/app/api/lib/uploadValidation"
import { logSecurityEvent } from "@/app/api/lib/securityLogger"
import { optimizeImage, withExtension } from "@/app/api/lib/storage/optimizeImage"
import { compressPdf } from "@/app/api/lib/storage/compressPdf"
import { putPrivateObject } from "@/app/api/lib/storage/r2"
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
      important: !!d.important,
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

  // Both passes run in this process: sharp downscales images, compressPdf
  // rewrites PDFs. Neither depends on the Python backend being reachable, which
  // is what made compression a silent no-op whenever that service was down.
  const isImage = validation.resourceType === "image"
  const optimized = isImage ? await optimizeImage(Buffer.from(buffer), mimeType) : null
  const compressed = isImage ? null : await compressPdf(Buffer.from(buffer))

  if (extension === "pdf" && compressed && !compressed.compressed) {
    // Not fatal -- the original is stored below -- but it is the thing that was
    // impossible to see before, so it gets said out loud.
    console.warn(
      `[vault] stored PDF uncompressed (${compressed.reason}): ${buffer.byteLength} bytes, user ${userContext.clerkUid}`
    )
  }

  const filename = optimized
    ? withExtension(validation.sanitizedFileName!, optimized.extension)
    : validation.sanitizedFileName!
  const { key: r2Key, exists } = await contentAddressedKey({
    prefix: `${userContext.clerkUid}/vault`,
    bytes: buffer,
    filename,
  })

  const payload = optimized?.buffer ?? compressed?.buffer ?? Buffer.from(buffer)
  const payloadMime = optimized?.contentType ?? mimeType

  let storedBytes = payload.length
  let storedMime = payloadMime
  // sha256 must describe the bytes that end up in R2, not the upload -- it is
  // what the verify endpoint re-checks, and compression changes them.
  let sha256 = createHash("sha256").update(payload).digest("hex")

  if (exists) {
    // Same user, same upload bytes, key already populated. The stored object was
    // written by an earlier upload, possibly under different compression
    // settings, so its hash cannot be assumed to match what this request would
    // produce -- it has to come off the row that wrote it. Getting this wrong is
    // what made a re-uploaded PDF verify as "corrupted".
    const sibling = await VaultDocument.findOne({ clerkUid: userContext.clerkUid, r2Key })
      .select("sha256 size mimeType")
      .lean<any>()

    if (sibling?.sha256) {
      sha256 = sibling.sha256
      storedBytes = sibling.size ?? storedBytes
      storedMime = sibling.mimeType ?? storedMime
    } else {
      // The object is there but no row describes it. Overwriting with what this
      // request produced is what makes the hash below true again.
      await putPrivateObject(r2Key, payload, payloadMime)
    }
  } else {
    await putPrivateObject(r2Key, payload, payloadMime)
  }

  const compressionStatus = optimized
    ? optimized.storedBytes < optimized.originalBytes
      ? "compressed"
      : "unchanged"
    : compressed?.compressed
      ? "compressed"
      : "unchanged"

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
    compressionStatus,
    compressionReason: compressed && !compressed.compressed ? compressed.reason : "",
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
