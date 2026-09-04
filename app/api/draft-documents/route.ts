import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceRateLimit,
  objectIdSchema,
  parseAndValidateJson,
  requireOwnedCase,
  requireUserContext,
} from "@/app/api/lib/routeGuards";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import DraftDocument from "@/app/api/lib/models/draft-document";
import DocumentTemplate from "@/app/api/lib/models/document-template";
import DocumentTemplateVersion from "@/app/api/lib/models/document-template-version";
import Case from "@/app/api/lib/models/case";
import Corpus from "@/app/api/lib/models/corpus";
import { sanitizeDocumentHtml } from "@/app/api/lib/html/sanitizeHtml";
import { renderTemplate } from "@/lib/templates/render";
import { resolveCaseSources } from "@/lib/templates/case-source";
import { recordFacts, syncFactSheet } from "@/app/api/lib/services/corpusFacts";
import type { TemplateField } from "@/lib/templates/fields";

const createSchema = z.object({
  templateId: objectIdSchema.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  seedPrompt: z.string().trim().max(2000).optional(),
  // Answers already collected -- by the wizard, by corpus autofill, or both.
  fieldValues: z.record(z.string(), z.unknown()).optional(),
  fieldProvenance: z.record(z.string(), z.unknown()).optional(),
  caseId: objectIdSchema.optional(),
  corpusId: z.string().trim().max(64).optional(),
  rememberInCorpus: z.boolean().optional(),
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

  const { templateId, title, seedPrompt, caseId, corpusId, rememberInCorpus } = parsed.data;

  await connectMongoWithRetry();

  // Checked once, up front. An unowned case id neither links nor fills
  // anything: without this, passing any id would pull another firm's court and
  // party details into your own draft.
  const ownsCase = caseId ? await requireOwnedCase(userContext.clerkUid, caseId) : false;
  if (caseId && !ownsCase) {
    return NextResponse.json({ success: false, error: "Case not found" }, { status: 404 });
  }

  // Corpora are scoped by clerkUid throughout the rest of the app; a draft may
  // only be linked to one the caller actually owns.
  if (corpusId && !(await Corpus.exists({ clerkUid: userContext.clerkUid, corpusId }))) {
    return NextResponse.json({ success: false, error: "Corpus not found" }, { status: 404 });
  }

  const draft = {
    clerkUid: userContext.clerkUid,
    title: title || "Untitled document",
    contentHtml: "",
    templateId: null as string | null,
    templateTitle: "",
    fieldsVersion: 0,
    fieldValues: {} as Record<string, unknown>,
    fieldProvenance: {} as Record<string, unknown>,
    caseId: caseId || null,
    corpusId: corpusId || null,
    rememberInCorpus: rememberInCorpus ?? !!corpusId,
    category: null as string | null,
    seedPrompt: seedPrompt || "",
  };

  if (templateId) {
    const template = await DocumentTemplate.findOne({ _id: templateId, status: "published" }).lean();
    if (!template) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }

    // Pinned at creation and never moved. Everything downstream -- rendering,
    // autofill, export -- resolves against this snapshot rather than the
    // template's latest, so an admin republishing the form cannot alter a
    // document somebody is part way through filling.
    const pinnedVersion = template.latestVersion ?? 1;
    const snapshot = await DocumentTemplateVersion.findOne({
      templateId,
      version: pinnedVersion,
    }).lean();

    const bodyHtml = snapshot?.bodyHtml ?? template.bodyHtml;
    const fields = (snapshot?.fields ?? (template.fields as TemplateField[]) ?? []) as TemplateField[];

    const values: Record<string, unknown> = { ...(parsed.data.fieldValues || {}) };
    const provenance: Record<string, unknown> = { ...(parsed.data.fieldProvenance || {}) };

    // A linked case fills what it plainly holds. Anything it does not hold --
    // an empty column, a case that was never linked -- simply stays unanswered
    // and becomes a question, rather than a blank on a filed document.
    if (ownsCase && fields.length > 0) {
      const caseDoc = await Case.findOne({ _id: caseId }).lean();
      const fromCase = resolveCaseSources(fields, caseDoc as Record<string, unknown> | null);
      for (const [key, resolved] of Object.entries(fromCase)) {
        if (values[key] === undefined || values[key] === "") {
          values[key] = resolved.value;
          provenance[key] = { source: "case" };
        }
      }
    }

    draft.title = title || template.title;
    draft.contentHtml =
      fields.length > 0 ? sanitizeDocumentHtml(renderTemplate(bodyHtml, fields, values)) : bodyHtml;
    draft.templateId = templateId;
    draft.templateTitle = template.title;
    draft.fieldsVersion = pinnedVersion;
    draft.fieldValues = values;
    draft.fieldProvenance = provenance;
    draft.category = template.category;
    await DocumentTemplate.updateOne({ _id: templateId }, { $inc: { usageCount: 1 } });
  }

  const created = await DraftDocument.create(draft);

  // What the advocate just told this form becomes something the next form does
  // not have to ask. Only values they typed or confirmed are kept -- recordFacts
  // drops anything whose provenance says it came back out of the corpus.
  if (draft.corpusId && draft.rememberInCorpus && draft.fieldsVersion > 0) {
    const snapshot = await DocumentTemplateVersion.findOne({
      templateId: draft.templateId,
      version: draft.fieldsVersion,
    })
      .select("fields")
      .lean();

    if (snapshot) {
      // Never allowed to fail the save: the document is created and correct
      // either way, and remembering is a convenience layered on top.
      try {
        await recordFacts({
          clerkUid: userContext.clerkUid,
          corpusId: draft.corpusId,
          fields: (snapshot.fields as TemplateField[]) || [],
          values: draft.fieldValues,
          provenance: draft.fieldProvenance as Record<string, { source?: string }>,
          draftId: created._id,
          templateId: draft.templateId,
          templateVersion: draft.fieldsVersion,
        });
        await syncFactSheet({ clerkUid: userContext.clerkUid, corpusId: draft.corpusId });
      } catch (error) {
        console.error("Corpus write-back failed for draft", String(created._id), error);
      }
    }
  }

  return NextResponse.json({ success: true, id: String(created._id) }, { status: 201 });
}
