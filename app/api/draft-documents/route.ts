import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceRateLimit,
  objectIdSchema,
  parseAndValidateJson,
  requireUserContext,
} from "@/app/api/lib/routeGuards";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import DraftDocument from "@/app/api/lib/models/draft-document";
import DocumentTemplate from "@/app/api/lib/models/document-template";

const createSchema = z.object({
  templateId: objectIdSchema.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  seedPrompt: z.string().trim().max(2000).optional(),
});

export async function GET(request: NextRequest) {
  const userContext = await requireUserContext(request);
  if (userContext instanceof NextResponse) return userContext;

  await connectMongoWithRetry();

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").replace(/[${}()\\]/g, "").trim().slice(0, 200);

  let page = parseInt(searchParams.get("page") || "1", 10);
  let limit = parseInt(searchParams.get("limit") || "10", 10);
  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 10;
  if (limit > 50) limit = 50;

  const query: Record<string, unknown> = { clerkUid: userContext.clerkUid };
  if (q) {
    query.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  }

  const [rows, total] = await Promise.all([
    DraftDocument.find(query)
      .select("-contentHtml -chatMessages")
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    DraftDocument.countDocuments(query),
  ]);

  return NextResponse.json({
    success: true,
    drafts: rows.map((d) => ({
      id: String(d._id),
      title: d.title,
      status: d.status,
      category: d.category,
      templateTitle: d.templateTitle,
      wordCount: d.wordCount,
      updatedAt: d.updatedAt,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

export async function POST(request: NextRequest) {
  const userContext = await requireUserContext(request);
  if (userContext instanceof NextResponse) return userContext;

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `draft:create:${userContext.clerkUid}`,
    max: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (blockedResponse) return blockedResponse;

  const parsed = await parseAndValidateJson(request, createSchema);
  if (!parsed.success) return parsed.response;

  const { templateId, title, seedPrompt } = parsed.data;

  await connectMongoWithRetry();

  const draft = {
    clerkUid: userContext.clerkUid,
    title: title || "Untitled document",
    contentHtml: "",
    templateId: null as string | null,
    templateTitle: "",
    category: null as string | null,
    seedPrompt: seedPrompt || "",
  };

  if (templateId) {
    const template = await DocumentTemplate.findOne({ _id: templateId, status: "published" }).lean();
    if (!template) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }
    draft.title = title || template.title;
    draft.contentHtml = template.bodyHtml;
    draft.templateId = templateId;
    draft.templateTitle = template.title;
    draft.category = template.category;
    await DocumentTemplate.updateOne({ _id: templateId }, { $inc: { usageCount: 1 } });
  }

  const created = await DraftDocument.create(draft);

  return NextResponse.json({ success: true, id: String(created._id) }, { status: 201 });
}
