import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { objectIdSchema, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import DraftDocument from "@/app/api/lib/models/draft-document";
import { sanitizeDocumentHtml } from "@/app/api/lib/html/sanitizeHtml";

const patchSchema = z
  .object({
    version: z.number().int().min(0),
    title: z.string().trim().min(1).max(200).optional(),
    contentHtml: z.string().max(400000).optional(),
    status: z.enum(["draft", "final"]).optional(),
    typography: z
      .object({ fontFamily: z.string().max(60), fontSizePt: z.number().min(8).max(24) })
      .optional(),
    wordCount: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 1, "Nothing to update");

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request);
  if (userContext instanceof NextResponse) return userContext;

  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  await connectMongoWithRetry();
  const draft = await DraftDocument.findOne({ _id: id, clerkUid: userContext.clerkUid }).lean();
  if (!draft) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    draft: {
      id: String(draft._id),
      title: draft.title,
      contentHtml: draft.contentHtml,
      status: draft.status,
      category: draft.category,
      templateTitle: draft.templateTitle,
      seedPrompt: draft.seedPrompt,
      typography: draft.typography,
      wordCount: draft.wordCount,
      version: draft.version,
      chatMessages: draft.chatMessages,
      updatedAt: draft.updatedAt,
    },
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request);
  if (userContext instanceof NextResponse) return userContext;

  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const parsed = await parseAndValidateJson(request, patchSchema);
  if (!parsed.success) return parsed.response;

  const { version, ...fields } = parsed.data;
  const update: Record<string, unknown> = { ...fields };
  if (fields.contentHtml !== undefined) {
    update.contentHtml = sanitizeDocumentHtml(fields.contentHtml);
  }

  await connectMongoWithRetry();

  const updated = await DraftDocument.findOneAndUpdate(
    { _id: id, clerkUid: userContext.clerkUid, version },
    { $set: update, $inc: { version: 1 } },
    { new: true, projection: "version updatedAt" }
  ).lean();

  if (updated) {
    return NextResponse.json({
      success: true,
      version: updated.version,
      updatedAt: updated.updatedAt,
    });
  }

  const current = await DraftDocument.findOne({ _id: id, clerkUid: userContext.clerkUid })
    .select("version")
    .lean();
  if (!current) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(
    { success: false, error: "Version conflict", currentVersion: current.version },
    { status: 409 }
  );
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request);
  if (userContext instanceof NextResponse) return userContext;

  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  await connectMongoWithRetry();
  const result = await DraftDocument.deleteOne({ _id: id, clerkUid: userContext.clerkUid });
  if (result.deletedCount === 0) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
