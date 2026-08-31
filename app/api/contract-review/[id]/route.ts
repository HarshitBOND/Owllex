import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { objectIdSchema, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import ContractReview from "@/app/api/lib/models/contract-review"
import { sanitizeDocumentHtml } from "@/app/api/lib/html/sanitizeHtml"

const patchSchema = z
  .object({
    version: z.number().int().min(0),
    contentHtml: z.string().max(400000).optional(),
    typography: z
      .object({ fontFamily: z.string().max(80), fontSizePt: z.number().min(8).max(24) })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 1, "Nothing to update")

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  await connectMongoWithRetry()
  const review = await ContractReview.findOne({ _id: id, clerkUid: userContext.clerkUid }).lean()
  if (!review) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    review: {
      id: String(review._id),
      fileName: review.fileName,
      size: review.size,
      contentHtml: review.contentHtml,
      typography: review.typography,
      status: review.status,
      errorMessage: review.errorMessage,
      issues: review.issues,
      summary: review.summary,
      chatMessages: review.chatMessages,
      version: review.version,
      updatedAt: review.updatedAt,
    },
  })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id } = await params
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  const parsed = await parseAndValidateJson(request, patchSchema)
  if (!parsed.success) return parsed.response

  const { version, ...fields } = parsed.data
  const update: Record<string, unknown> = { ...fields }
  if (fields.contentHtml !== undefined) {
    update.contentHtml = sanitizeDocumentHtml(fields.contentHtml)
  }

  await connectMongoWithRetry()

  const updated = await ContractReview.findOneAndUpdate(
    { _id: id, clerkUid: userContext.clerkUid, version },
    { $set: update, $inc: { version: 1 } },
    { new: true, projection: "version updatedAt" },
  ).lean()

  if (updated) {
    return NextResponse.json({ success: true, version: updated.version, updatedAt: updated.updatedAt })
  }

  const current = await ContractReview.findOne({ _id: id, clerkUid: userContext.clerkUid })
    .select("version")
    .lean()
  if (!current) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  return NextResponse.json(
    { success: false, error: "Version conflict", currentVersion: current.version },
    { status: 409 },
  )
}
