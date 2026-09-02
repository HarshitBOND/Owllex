import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, requireUserContext } from "@/app/api/lib/routeGuards"
import { validateUploadBuffer } from "@/app/api/lib/uploadValidation"
import { logSecurityEvent } from "@/app/api/lib/securityLogger"
import { putPrivateObject } from "@/app/api/lib/storage/r2"
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

    const r2Key = `${userContext.clerkUid}/contract-review/${randomUUID()}-${validation.sanitizedFileName}`
    await putPrivateObject(r2Key, buffer, file.type || "application/octet-stream")

    await connectMongoWithRetry()
    const review = await ContractReview.create({
      clerkUid: userContext.clerkUid,
      fileName: validation.sanitizedFileName,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      r2Key,
      status: "extracting",
    })

    try {
      const { text } = await extractDocumentText({
        filename: validation.sanitizedFileName!,
        bytes: buffer,
        mimeType: file.type || "application/octet-stream",
      })
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
