import { NextRequest, NextResponse } from "next/server";
import {
  requireAdmin,
  logAdminAction,
  sanitizeQuery,
  parsePagination,
} from "@/app/api/lib/adminMiddleware";
import { parseAndValidateJson } from "@/app/api/lib/routeGuards";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import DocumentTemplate from "@/app/api/lib/models/document-template";
import { htmlToPlainText, sanitizeDocumentHtml } from "@/app/api/lib/html/sanitizeHtml";
import {
  MIN_PUBLISHED_BODY_CHARS,
  PUBLISH_BODY_ERROR,
  assertOverlayComplete,
  assertTemplateConsistent,
  slugify,
  templateInputSchema,
} from "@/app/api/lib/documentTemplates";
import { seedFirstVersion } from "@/app/api/lib/services/templateVersions";
import { DOCUMENT_CATEGORIES } from "@/lib/document-categories";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  await connectMongoWithRetry();

  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = parsePagination(searchParams);
  const search = sanitizeQuery(searchParams.get("search") || "");
  const category = sanitizeQuery(searchParams.get("category") || "");
  const status = sanitizeQuery(searchParams.get("status") || "");

  const query: Record<string, unknown> = {};

  if (search) {
    const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [
      { title: { $regex: safeSearch, $options: "i" } },
      { description: { $regex: safeSearch, $options: "i" } },
    ];
  }
  if ((DOCUMENT_CATEGORIES as readonly string[]).includes(category)) {
    query.category = category;
  }
  if (status === "draft" || status === "published" || status === "archived") {
    query.status = status;
  }

  const [templates, total] = await Promise.all([
    DocumentTemplate.find(query)
      .select("-bodyHtml")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DocumentTemplate.countDocuments(query),
  ]);

  await logAdminAction(admin.dbUserId, "viewed_document_templates", request, {
    targetType: "document",
    details: `Listed document templates page=${page}`,
  });

  return NextResponse.json({
    success: true,
    templates,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const parsed = await parseAndValidateJson(request, templateInputSchema);
  if (!parsed.success) return parsed.response;

  const { title, description, category, status, fields, renderMode, changeNote } = parsed.data;
  const bodyHtml = sanitizeDocumentHtml(parsed.data.bodyHtml);

  if (status === "published" && htmlToPlainText(bodyHtml).length < MIN_PUBLISHED_BODY_CHARS) {
    return NextResponse.json({ success: false, error: PUBLISH_BODY_ERROR }, { status: 400 });
  }

  const inconsistent = assertTemplateConsistent(bodyHtml, fields);
  if (inconsistent) {
    return NextResponse.json({ success: false, error: inconsistent }, { status: 400 });
  }
  if (renderMode === "pdf-overlay") {
    const unmapped = assertOverlayComplete(fields);
    if (unmapped) {
      return NextResponse.json({ success: false, error: unmapped }, { status: 400 });
    }
  }

  await connectMongoWithRetry();

  const base = slugify(title);
  let slug = base;
  for (let n = 2; await DocumentTemplate.exists({ slug }); n++) {
    slug = `${base}-${n}`;
    if (n > 50) {
      slug = `${base}-${Date.now()}`;
      break;
    }
  }

  const template = await DocumentTemplate.create({
    title,
    slug,
    description,
    category,
    bodyHtml,
    fields,
    status,
    latestVersion: 1,
    createdBy: admin.dbUserId,
    updatedBy: admin.dbUserId,
    publishedAt: status === "published" ? new Date() : null,
  });

  await seedFirstVersion({
    templateId: template._id,
    userId: admin.dbUserId,
    input: { bodyHtml, fields, renderMode, changeNote },
  });

  await logAdminAction(admin.dbUserId, "created_document_template", request, {
    targetType: "document",
    targetId: String(template._id),
    details: `Created template "${title}" (${status})`,
  });

  return NextResponse.json({ success: true, template }, { status: 201 });
}
