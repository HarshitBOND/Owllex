import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/app/api/lib/adminMiddleware";
import { objectIdSchema, parseAndValidateJson } from "@/app/api/lib/routeGuards";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import DocumentTemplate from "@/app/api/lib/models/document-template";
import DocumentTemplateVersion from "@/app/api/lib/models/document-template-version";
import DraftDocument from "@/app/api/lib/models/draft-document";
import { htmlToPlainText, sanitizeDocumentHtml } from "@/app/api/lib/html/sanitizeHtml";
import { publishTemplateVersion } from "@/app/api/lib/services/templateVersions";
import {
  MIN_PUBLISHED_BODY_CHARS,
  PUBLISH_BODY_ERROR,
  assertOverlayComplete,
  assertTemplateConsistent,
  templatePatchSchema,
} from "@/app/api/lib/documentTemplates";
import type { TemplateField } from "@/lib/templates/fields";

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

  const versions = await DocumentTemplateVersion.find({ templateId: id })
    .select("version changeNote renderMode publishedAt createdAt")
    .sort({ version: -1 })
    .limit(50)
    .lean();

  return NextResponse.json({ success: true, template, versions });
}

/**
 * Metadata edits update the family in place; content edits publish a new
 * version and never touch the old one.
 *
 * The split matters because a draft pins the version it was started on.
 * Retitling a form should not strand every document already drafted from it on
 * a stale snapshot, but rewording a clause must, or an advocate's half-filed
 * document would change underneath them.
 */
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

  const contentChanged =
    body.bodyHtml !== undefined || body.fields !== undefined || body.renderMode !== undefined;

  const nextBodyHtml =
    body.bodyHtml !== undefined ? sanitizeDocumentHtml(body.bodyHtml) : template.bodyHtml;
  const nextFields = (body.fields ?? template.fields ?? []) as TemplateField[];
  const nextRenderMode = body.renderMode ?? "html";

  if (contentChanged) {
    const inconsistent = assertTemplateConsistent(nextBodyHtml, nextFields);
    if (inconsistent) {
      return NextResponse.json({ success: false, error: inconsistent }, { status: 400 });
    }
    if (nextRenderMode === "pdf-overlay") {
      const unmapped = assertOverlayComplete(nextFields);
      if (unmapped) {
        return NextResponse.json({ success: false, error: unmapped }, { status: 400 });
      }
    }
  }

  if (body.title !== undefined) template.title = body.title;
  if (body.description !== undefined) template.description = body.description;
  if (body.category !== undefined) template.category = body.category;
  if (body.status !== undefined) template.status = body.status;

  if (
    template.status === "published" &&
    htmlToPlainText(nextBodyHtml).length < MIN_PUBLISHED_BODY_CHARS
  ) {
    return NextResponse.json({ success: false, error: PUBLISH_BODY_ERROR }, { status: 400 });
  }

  if (template.status === "published" && previousStatus !== "published") {
    template.publishedAt = new Date();
  }
  template.updatedBy = admin.dbUserId;
  await template.save();

  let newVersion: number | null = null;
  if (contentChanged) {
    // Writes the snapshot and re-points the family mirror together, so the two
    // cannot drift.
    const version = await publishTemplateVersion({
      templateId: id,
      userId: admin.dbUserId,
      input: {
        bodyHtml: nextBodyHtml,
        fields: nextFields,
        renderMode: nextRenderMode,
        changeNote: body.changeNote ?? "",
      },
    });
    newVersion = version.version;
  }

  const action =
    body.status && body.status !== previousStatus
      ? body.status === "published"
        ? "published_document_template"
        : "unpublished_document_template"
      : "updated_document_template";

  await logAdminAction(admin.dbUserId, action, request, {
    targetType: "document",
    targetId: id,
    details: newVersion
      ? `Template "${template.title}" -- published version ${newVersion}`
      : `Template "${template.title}"`,
  });

  const fresh = await DocumentTemplate.findById(id).lean();
  return NextResponse.json({ success: true, template: fresh, newVersion });
}

/**
 * Archives rather than deletes once any draft references the template.
 *
 * Drafts resolve their content through templateId; removing the row orphans
 * every document already drafted from it, and the advocate finds out only when
 * they next open one. Archiving takes it out of the library and leaves those
 * documents intact.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  await connectMongoWithRetry();
  const template = await DocumentTemplate.findById(id);
  if (!template) {
    return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
  }

  const dependentDrafts = await DraftDocument.countDocuments({ templateId: id });

  if (dependentDrafts > 0) {
    template.status = "archived";
    template.updatedBy = admin.dbUserId;
    await template.save();

    await logAdminAction(admin.dbUserId, "archived_document_template", request, {
      targetType: "document",
      targetId: id,
      details: `Archived template "${template.title}" (${dependentDrafts} drafts reference it)`,
    });

    return NextResponse.json({
      success: true,
      archived: true,
      dependentDrafts,
      message: `"${template.title}" is used by ${dependentDrafts} ${
        dependentDrafts === 1 ? "document" : "documents"
      }, so it has been archived instead of deleted. It no longer appears in the library, and those documents still open.`,
    });
  }

  await DocumentTemplateVersion.deleteMany({ templateId: id });
  await DocumentTemplate.findByIdAndDelete(id);

  await logAdminAction(admin.dbUserId, "deleted_document_template", request, {
    targetType: "document",
    targetId: id,
    details: `Deleted template "${template.title}"`,
  });

  return NextResponse.json({ success: true, archived: false });
}
