import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/app/api/lib/adminMiddleware";
import { objectIdSchema, parseAndValidateJson } from "@/app/api/lib/routeGuards";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import DocumentTemplate from "@/app/api/lib/models/document-template";
import { htmlToPlainText, sanitizeDocumentHtml } from "@/app/api/lib/html/sanitizeHtml";
import {
  MIN_PUBLISHED_BODY_CHARS,
  PUBLISH_BODY_ERROR,
  templatePatchSchema,
} from "@/app/api/lib/documentTemplates";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  await connectMongoWithRetry();
  const template = await DocumentTemplate.findById(id).lean();
  if (!template) {
    return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, template });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  const parsed = await parseAndValidateJson(request, templatePatchSchema);
  if (!parsed.success) return parsed.response;

  await connectMongoWithRetry();
  const template = await DocumentTemplate.findById(id);
  if (!template) {
    return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
  }

  const body = parsed.data;
  const previousStatus = template.status;

  if (body.title !== undefined) template.title = body.title;
  if (body.description !== undefined) template.description = body.description;
  if (body.category !== undefined) template.category = body.category;
  if (body.bodyHtml !== undefined) template.bodyHtml = sanitizeDocumentHtml(body.bodyHtml);
  if (body.status !== undefined) template.status = body.status;

  if (
    template.status === "published" &&
    htmlToPlainText(template.bodyHtml).length < MIN_PUBLISHED_BODY_CHARS
  ) {
    return NextResponse.json({ success: false, error: PUBLISH_BODY_ERROR }, { status: 400 });
  }

  if (template.status === "published" && previousStatus !== "published") {
    template.publishedAt = new Date();
  }
  template.updatedBy = admin.dbUserId;
  await template.save();

  const action =
    body.status && body.status !== previousStatus
      ? body.status === "published"
        ? "published_document_template"
        : "unpublished_document_template"
      : "updated_document_template";

  await logAdminAction(admin.dbUserId, action, request, {
    targetType: "document",
    targetId: id,
    details: `Template "${template.title}"`,
  });

  return NextResponse.json({ success: true, template });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  await connectMongoWithRetry();
  const template = await DocumentTemplate.findByIdAndDelete(id);
  if (!template) {
    return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
  }

  await logAdminAction(admin.dbUserId, "deleted_document_template", request, {
    targetType: "document",
    targetId: id,
    details: `Deleted template "${template.title}"`,
  });

  return NextResponse.json({ success: true });
}
