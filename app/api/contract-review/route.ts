import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, requireUserContext } from "@/app/api/lib/routeGuards"
import { validateUploadBuffer } from "@/app/api/lib/uploadValidation"
import { logSecurityEvent } from "@/app/api/lib/securityLogger"
import { putPrivateObject } from "@/app/api/lib/storage/r2"
import { contentAddressedKey } from "@/app/api/lib/storage/dedupe"
import { optimizeImage, withExtension } from "@/app/api/lib/storage/optimizeImage"
import { extractDocumentText } from "@/app/api/lib/contractExtract"
import { markdownToHtml } from "@/app/api/lib/html/markdownToHtml"
import { sanitizeDocumentHtml } from "@/app/api/lib/html/sanitizeHtml"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import ContractReview from "@/app/api/lib/models/contract-review"

export const maxDuration = 120

export async function GET(request: NextRequest) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  await connectMongoWithRetry()
  const reviews = await ContractReview.find({ clerkUid: userContext.clerkUid })
    .sort({ updatedAt: -1 })
    .limit(20)
    .select("fileName status updatedAt")
    .lean()

  return NextResponse.json({
    success: true,
    reviews: reviews.map((r) => ({
      id: String(r._id),
      fileName: r.fileName,
      status: r.status,
      updatedAt: r.updatedAt,
    })),
  })
}

export async function POST(request: NextRequest) {
  try {
    const userContext = await requireUserContext(request)
    if (userContext instanceof NextResponse) return userContext

    const { blockedResponse } = await enforceRateLimit(request, {
      key: `contract-review:upload:${userContext.clerkUid}`,
      max: 20,
      windowMs: 10 * 60 * 1000,
    })
    if (blockedResponse) return blockedResponse

    const formData = await request.formData()
    const file = formData.get("file")

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 })
    }

    const maxFileSizeBytes = 25 * 1024 * 1024
    if (file.size > maxFileSizeBytes) {
      return NextResponse.json({ success: false, error: "File size exceeds 25MB" }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const validation = validateUploadBuffer(file.name, new Uint8Array(buffer), file.type)
    if (!validation.ok) {
      logSecurityEvent({
        type: "upload_failed",
        level: "warn",
        message: "Contract review upload rejected by validation",
        request,
        userId: userContext.clerkUid,
        details: { reason: validation.error, originalFileName: file.name, mimeType: file.type },
      })
      return NextResponse.json({ success: false, error: validation.error || "Unsupported file" }, { status: 400 })
    }

    // Narrower than validateUploadBuffer's general allow-list: only what the extraction
    // pipeline (Docling) actually handles, checked before spending an R2 upload on it.
    const extension = validation.sanitizedFileName!.toLowerCase().split(".").pop()
    const EXTRACTABLE_EXTENSIONS = new Set(["pdf", "docx", "txt", "md", "jpg", "jpeg", "png"])
    if (!extension || !EXTRACTABLE_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { success: false, error: "Only PDF, DOCX, TXT, MD, JPG, or PNG files are accepted" },
        { status: 400 },
      )
    }

    const mimeType = file.type || "application/octet-stream"

    // Images are downscaled here; PDFs are compressed by the backend during
    // extraction below, because Ghostscript cannot run on Vercel.
    const isImage = validation.resourceType === "image"
    const optimized = isImage ? await optimizeImage(buffer, mimeType) : null
    const storedBuffer = optimized?.buffer ?? buffer
    const storedMime = optimized?.contentType ?? mimeType
    const storedName = optimized
      ? withExtension(validation.sanitizedFileName!, optimized.extension)
      : validation.sanitizedFileName!

    const { key: r2Key, exists } = await contentAddressedKey({
      prefix: `${userContext.clerkUid}/contract-review`,
      bytes: buffer,
      filename: storedName,
    })

    // Images are already final, so they are written now. PDFs and DOCX wait for
    // the extraction call to store the compressed copy -- with a fallback below
    // so a failed extraction still leaves the user their file. Either way, an
    // object already at this key is the same bytes and is reused as-is.
    if (isImage && !exists) {
      await putPrivateObject(r2Key, storedBuffer, storedMime)
    }

    await connectMongoWithRetry()
    const review = await ContractReview.create({
      clerkUid: userContext.clerkUid,
      fileName: storedName,
      mimeType: storedMime,
      size: storedBuffer.length,
      r2Key,
      status: "extracting",
    })

    try {
      const extracted = await extractDocumentText({
        filename: validation.sanitizedFileName!,
        bytes: buffer,
        mimeType,
        // Images were already stored above; everything else is archived by the
        // backend so it passes through Ghostscript first. A key that already
        // holds these bytes needs no write at all.
        r2Key: isImage || exists ? undefined : r2Key,
      })
      const { text } = extracted

      // The backend declined or failed the write (R2 unconfigured on that
      // instance, say). Store the original from here so the file is never lost.
      if (!isImage && !exists && extracted.stored !== true) {
        await putPrivateObject(r2Key, buffer, mimeType)
      } else if (extracted.stored_bytes) {
        review.size = extracted.stored_bytes
      }
      const contentHtml = sanitizeDocumentHtml(markdownToHtml(text))

      review.extractedText = text
      review.contentHtml = contentHtml
      review.status = "extracted"
      await review.save()

      return NextResponse.json({
        success: true,
        id: String(review._id),
        contentHtml,
        typography: review.typography,
        version: review.version,
        fileMeta: { name: review.fileName, size: review.size, uploadedLabel: "Uploaded just now" },
      })
    } catch (error) {
      if (!isImage && !exists) {
        // Extraction is what would have stored this file, so on failure the
        // original is uploaded here instead -- the review row already points at
        // this key and the user can still download what they sent.
        await putPrivateObject(r2Key, buffer, mimeType).catch(() => {})
      }
      review.status = "error"
      review.errorMessage = error instanceof Error ? error.message : "Extraction failed"
      await review.save()
      return NextResponse.json(
        { success: false, error: review.errorMessage, id: String(review._id) },
        { status: 502 },
      )
    }
  } catch (error) {
    console.error("[CONTRACT_REVIEW_UPLOAD] Unhandled error:", error)
    logSecurityEvent({
      type: "upload_failed",
      level: "error",
      message: "Contract review upload failed with server error",
      request,
      details: { error: error instanceof Error ? error.message : String(error) },
    })
    return NextResponse.json(
      { success: false, error: "Upload failed. Please try again." },
      { status: 500 },
    )
  }
}
