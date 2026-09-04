import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, requireUserContext } from "@/app/api/lib/routeGuards"
import { validateUploadBuffer } from "@/app/api/lib/uploadValidation"
import { logSecurityEvent } from "@/app/api/lib/securityLogger"
import { putPrivateObject } from "@/app/api/lib/storage/r2"
import { contentAddressedKey } from "@/app/api/lib/storage/dedupe"
import { optimizeImage, withExtension } from "@/app/api/lib/storage/optimizeImage"
import { compressPdf } from "@/app/api/lib/storage/compressPdf"
import { extractDocumentText } from "@/app/api/lib/contractExtract"
import { markdownToHtml } from "@/app/api/lib/html/markdownToHtml"
import { sanitizeDocumentHtml } from "@/app/api/lib/html/sanitizeHtml"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import ContractReview from "@/app/api/lib/models/contract-review"

// Extraction is the long pole: Docling measures ~30s on a 15-page text PDF and
// far more on a scanned one it has to OCR, before R2 and Mongo are even touched.
// At 120 the platform killed the function mid-extraction and the browser got a
// gateway error page instead of JSON -- see EXTRACT_TIMEOUT_MS, which is set
// under this so the timeout is reported rather than swallowed.
export const maxDuration = 300

/** Matches the maxlength on ContractReview.extractedText / .contentHtml. */
const MAX_DOCUMENT_FIELD_CHARS = 400_000

function clampToFieldLimit(value: string) {
  return value.length > MAX_DOCUMENT_FIELD_CHARS ? value.slice(0, MAX_DOCUMENT_FIELD_CHARS) : value
}

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

    const EXTRACTION_MODES = new Set(["auto", "force_ocr", "text_only"])
    const requestedMode = formData.get("extractionMode")
    const extractionMode = typeof requestedMode === "string" && EXTRACTION_MODES.has(requestedMode)
      ? (requestedMode as "auto" | "force_ocr" | "text_only")
      : "auto"

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

    // Images are downscaled here; PDFs are recompressed in-process by
    // compressPdf. This used to be the backend's job, done as a side effect of
    // the extraction call below -- which meant a backend that was down or
    // unconfigured stored the file full-size and said nothing. compressPdf runs
    // on Vercel, so it cannot be skipped that way.
    const isImage = validation.resourceType === "image"
    const optimized = isImage ? await optimizeImage(buffer, mimeType) : null
    const compressed = isImage ? null : await compressPdf(buffer)
    const storedBuffer = optimized?.buffer ?? compressed?.buffer ?? buffer
    const storedMime = optimized?.contentType ?? mimeType
    const storedName = optimized
      ? withExtension(validation.sanitizedFileName!, optimized.extension)
      : validation.sanitizedFileName!

    if (compressed && !compressed.compressed) {
      console.warn(
        `[contract-review] stored file uncompressed (${compressed.reason}): ${buffer.length} bytes, user ${userContext.clerkUid}`
      )
    }

    const { key: r2Key, exists } = await contentAddressedKey({
      prefix: `${userContext.clerkUid}/contract-review`,
      bytes: buffer,
      filename: storedName,
    })

    // Everything is written here, before extraction, rather than leaving the
    // write to the backend. Storing up front is also what makes the file
    // survive an extraction that times out or throws -- the fallback writes
    // that used to do that are gone with it. An object already at this key
    // holds the same upload bytes and is reused as-is.
    if (!exists) {
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
      const { text: rawText } = await extractDocumentText({
        filename: validation.sanitizedFileName!,
        bytes: buffer,
        mimeType,
        // No r2Key: this route stores its own file now. The backend extracts
        // and nothing else. Note the *original* bytes go for extraction, not
        // the compressed ones -- OCR should read the sharpest copy available.
        mode: extractionMode,
      })

      // Both columns are capped at 400k in the schema, and a long contract does
      // exceed that. Mongoose enforces maxlength by throwing on save, which the
      // catch below would report to the user as an extraction failure for a
      // document that extracted perfectly -- so trim to fit instead.
      const text = clampToFieldLimit(rawText)
      const contentHtml = clampToFieldLimit(sanitizeDocumentHtml(markdownToHtml(text)))

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
      // The file is already in R2 from before extraction started, so there is
      // nothing to rescue here -- the review row points at a key that holds it
      // and the user can still download what they sent.
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
