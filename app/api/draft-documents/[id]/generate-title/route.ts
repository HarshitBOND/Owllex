import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText } from "ai";
import { enforceRateLimit, objectIdSchema, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import DraftDocument from "@/app/api/lib/models/draft-document";
import { sanitizeDocumentHtml } from "@/app/api/lib/html/sanitizeHtml";
import { trimDocumentForPrompt } from "@/lib/ai/document-context";
import { modelFor } from "@/lib/ai/provider";
import { AI_MAX_RETRIES } from "@/lib/ai/models";
import { DRAFT_TITLE_PROMPT } from "@/lib/ai/prompts";
import { checkAiAllowance, aiLimitResponse, recordAiUsage } from "@/app/api/lib/services/aiUsage";

const bodySchema = z.object({
  contentHtml: z.string().max(200000).default(""),
});

// A title generation isn't worth more than a paragraph or two of context --
// keeping the budget small keeps this call cheap regardless of how long the
// document has grown by the time it fires.
const TITLE_CONTEXT_CHARS = 4000;

/**
 * Proposes a heading for a draft, once -- fired by the client the moment a
 * freeform draft first gets real content (see DraftWorkspace's applyProposal).
 * Never overwrites a title the advocate (or an earlier call) already set.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request);
  if (userContext instanceof NextResponse) return userContext;

  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `draft:title:${userContext.clerkUid}`,
    max: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (blockedResponse) return blockedResponse;

  const parsed = await parseAndValidateJson(request, bodySchema);
  if (!parsed.success) return parsed.response;

  await connectMongoWithRetry();
  const draft = await DraftDocument.findOne({ _id: id, clerkUid: userContext.clerkUid })
    .select("title contentHtml")
    .lean();
  if (!draft) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  // Already renamed -- by the advocate, or by a previous call racing this
  // one -- so there is nothing left to propose.
  if (draft.title && draft.title !== "Untitled document") {
    return NextResponse.json({ success: true, title: draft.title, skipped: true });
  }

  const html = parsed.data.contentHtml || draft.contentHtml || "";
  const text = trimDocumentForPrompt(sanitizeDocumentHtml(html), TITLE_CONTEXT_CHARS);
  if (!text.trim()) {
    return NextResponse.json({ success: false, error: "Nothing to title yet." }, { status: 400 });
  }

  const gate = await checkAiAllowance(userContext.clerkUid);
  if (!gate.allowed) return aiLimitResponse(gate);

  const result = await generateText({
    model: modelFor("fast"),
    system: DRAFT_TITLE_PROMPT,
    prompt: `<document>\n${text}\n</document>`,
    maxOutputTokens: 30,
    maxRetries: AI_MAX_RETRIES,
  });

  await recordAiUsage({ clerkUid: userContext.clerkUid, feature: "draft-title", modelKey: "fast", usage: result.usage });

  const title = result.text
    .replace(/^["'“”\s]+|["'“”\s.]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 200)
    .trim();

  if (!title) {
    return NextResponse.json({ success: false, error: "Couldn't come up with a title." }, { status: 502 });
  }

  // No version bump -- this races the editor's own autosave, which is free to
  // overwrite it moments later with whatever the advocate has typed since.
  await DraftDocument.updateOne(
    { _id: id, clerkUid: userContext.clerkUid, title: "Untitled document" },
    { $set: { title } }
  );

  return NextResponse.json({ success: true, title });
}
