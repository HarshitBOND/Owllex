import { NextRequest, NextResponse } from "next/server"
import { streamText, convertToModelMessages, stepCountIs, smoothStream, tool, type UIMessage } from "ai"
import { z } from "zod"
import { enforceRateLimit, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DraftDocument from "@/app/api/lib/models/draft-document"
import DocumentTemplateVersion from "@/app/api/lib/models/document-template-version"
import CorpusDocument from "@/app/api/lib/models/corpus-document"
import { searchCorpus } from "@/app/api/lib/corpusBackend"
import { factsForFields } from "@/app/api/lib/services/corpusFacts"
import { sanitizeDocumentHtml } from "@/app/api/lib/html/sanitizeHtml"
import { renderTemplate, missingRequired } from "@/lib/templates/render"
import type { TemplateField } from "@/lib/templates/fields"
import { modelFor } from "@/lib/ai/provider"
import { resolveModel, OUTPUT_CAPS, AI_MAX_RETRIES } from "@/lib/ai/models"
import {
  DRAFTING_SYSTEM_PROMPT,
  DRAFT_TOOL_RULES,
  DRAFT_FIELD_RULES,
  DRAFT_CORPUS_RULES,
} from "@/lib/ai/prompts"
import { checkAiAllowance, aiLimitResponse, recordAiUsage } from "@/app/api/lib/services/aiUsage"
import { trimDocumentForPrompt } from "@/lib/ai/document-context"
import {
  messagesForStorage,
  settleDanglingToolCalls,
  stripEphemeralParts,
  MAX_STORED_MESSAGES,
} from "@/lib/ai/message-trim"

export const maxDuration = 60

const bodySchema = z.object({
  id: z.string().min(1).max(64),
  model: z.string().optional(),
  documentHtml: z.string().max(200000).default(""),
  messages: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(["user", "assistant", "system"]),
        parts: z.array(z.any()),
      })
    )
    .min(1)
    .max(200),
})

export async function POST(request: NextRequest) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { success: false, error: "The AI assistant is not configured. Set OPENAI_API_KEY." },
      { status: 503 }
    )
  }

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `ai:draft:${userContext.clerkUid}`,
    max: 30,
    windowMs: 10 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  const parsed = await parseAndValidateJson(request, bodySchema)
  if (!parsed.success) return parsed.response

  const { id: draftId, model, documentHtml, messages } = parsed.data

  const gate = await checkAiAllowance(userContext.clerkUid)
  if (!gate.allowed) return aiLimitResponse(gate)
  const modelKey = resolveModel(gate.snapshot.plan, model, "balanced")

  // A document started from a court form is filled, not redrafted. Loading its
  // snapshot lets the model be told which blanks exist, which are still empty,
  // and that the surrounding wording is the court's and not its to improve.
  await connectMongoWithRetry()
  const draftRecord = await DraftDocument.findOne({ _id: draftId, clerkUid: userContext.clerkUid })
    .select("templateId fieldsVersion fieldValues templateTitle corpusId")
    .lean()

  let fields: TemplateField[] = []
  let templateBodyHtml = ""
  if (draftRecord?.templateId && draftRecord.fieldsVersion > 0) {
    const snapshot = await DocumentTemplateVersion.findOne({
      templateId: draftRecord.templateId,
      version: draftRecord.fieldsVersion,
    })
      .select("fields bodyHtml")
      .lean()
    fields = (snapshot?.fields as TemplateField[]) || []
    templateBodyHtml = snapshot?.bodyHtml || ""
  }

  const fieldValues = (draftRecord?.fieldValues as Record<string, unknown>) || {}
  const isFormFill = fields.length > 0

  /**
   * What this matter's own corpus can already tell the assistant.
   *
   * Without it the model asks the advocate for the court, the parties and the
   * dates that are sitting in the plaint they uploaded ten minutes ago -- which
   * is exactly the retyping this feature exists to remove. Facts recorded from
   * earlier forms come first because they are exact and free; retrieval only
   * covers what they do not.
   */
  let corpusContext = ""
  if (draftRecord?.corpusId) {
    const corpusId = draftRecord.corpusId

    try {
      const known: string[] = []

      if (isFormFill) {
        const facts = await factsForFields({ clerkUid: userContext.clerkUid, corpusId, fields })
        for (const [key, fact] of Object.entries(facts)) {
          known.push(`- ${fact.label || key}: ${fact.value}`)
        }
      }

      const indexed = await CorpusDocument.countDocuments({
        clerkUid: userContext.clerkUid,
        corpusId,
        status: "ready",
      })

      const excerpts: string[] = []
      if (indexed > 0) {
        const query = isFormFill
          ? [draftRecord.templateTitle, ...fields.map((f) => f.label)].filter(Boolean).join(", ")
          : messages
              .slice(-2)
              .flatMap((m) => m.parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text))
              .join(" ")
              .slice(0, 600)

        if (query.trim()) {
          const search = await searchCorpus({ corpusId, clerkUid: userContext.clerkUid, query, k: 8 })
          for (const [i, result] of search.results.entries()) {
            excerpts.push(`--- excerpt ${i + 1}${result.title ? ` from "${result.title}"` : ""} ---\n${result.text}`)
          }
        }
      }

      if (known.length > 0 || excerpts.length > 0) {
        corpusContext = [
          "",
          "<case_file>",
          "These come from this matter's own corpus -- the advocate's uploaded documents and",
          "answers they gave on earlier forms. Use them. Do not ask for anything answered here.",
          ...(known.length > 0 ? ["", "Already recorded for this matter:", ...known] : []),
          ...(excerpts.length > 0 ? ["", "From the documents in this matter:", ...excerpts] : []),
          "</case_file>",
        ].join("\n")
      }
    } catch (error) {
      // Corpus context is an improvement, not a requirement: losing it means
      // the assistant asks more questions, not that drafting fails.
      console.error("Corpus context unavailable for draft", draftId, error)
    }
  }

  // Sanitized before it reaches the model, so a poisoned document body cannot
  // smuggle markup or handlers into the prompt.
  const safeDocument = trimDocumentForPrompt(sanitizeDocumentHtml(documentHtml))

  // The system prompt is byte-identical across every request FOR A GIVEN DRAFT:
  // which blocks are included depends only on whether this draft came from a
  // form and whether it has a corpus, neither of which changes mid-conversation.
  // That stability is the point. The document used to live in here, and because
  // it changes on each turn it invalidated the cached prefix -- system, tool
  // definitions and the whole history behind it -- on every single call. The
  // document and the case file go in the last message instead, so everything
  // before them caches at a tenth of the input rate.
  const system = [
    DRAFTING_SYSTEM_PROMPT,
    DRAFT_TOOL_RULES,
    ...(isFormFill ? [DRAFT_FIELD_RULES] : []),
    ...(draftRecord?.corpusId ? [DRAFT_CORPUS_RULES] : []),
  ].join("\n\n")

  // Repairs history that reaches us with a tool call the advocate answered in
  // prose rather than with a button. Without this the whole conversation is
  // rejected, and since it is persisted, the draft's assistant stays broken.
  const history = await convertToModelMessages(
    settleDanglingToolCalls(stripEphemeralParts(messages.slice(-MAX_STORED_MESSAGES) as UIMessage[]))
  )
  // The field schema rides in the same trailing message as the document, so the
  // cached prefix -- system, tools and history -- is not invalidated by it.
  const fieldContext = isFormFill
    ? [
        "",
        `<form name="${draftRecord?.templateTitle ?? ""}">`,
        ...fields.map((field) => {
          const filled =
            field.type === "table"
              ? JSON.stringify(fieldValues[field.key] ?? [])
              : String(fieldValues[field.key] ?? "")
          const columns =
            field.type === "table"
              ? ` columns=[${field.columns.map((c) => `${c.key}:"${c.label}"`).join(", ")}]`
              : field.type === "select"
                ? ` choices=[${field.options.join(" | ")}]`
                : ""
          return `  ${field.key} (${field.type}${field.required ? ", required" : ""})${columns} — "${field.label}" — currently: ${filled || "(empty)"}`
        }),
        "</form>",
        missingRequired(fields, fieldValues).length > 0
          ? `Still required: ${missingRequired(fields, fieldValues).map((f) => f.label).join(", ")}.`
          : "Every required field has a value.",
      ].join("\n")
    : ""

  const documentMessage = {
    role: "user" as const,
    content: `<current_document>\n${safeDocument || "(The document is empty.)"}\n</current_document>${fieldContext}${corpusContext}`,
  }

  const result = streamText({
    model: modelFor(modelKey),
    system,
    messages: [...history, documentMessage],
    tools: {
      // No execute: this streams to the client and waits for the advocate to
      // accept or discard the redline before anything touches the editor.
      proposeDocument: tool({
        description:
          "Return the complete updated document whenever the user asks you to write, add, remove or change anything in it. Always return the ENTIRE document, preserving verbatim every section you were not asked to change.",
        inputSchema: z.object({
          html: z
            .string()
            .min(1)
            .describe("The complete document as clean semantic HTML. No markdown fences, no inline styles."),
          summary: z
            .string()
            .max(200)
            .describe("One line describing what changed, e.g. 'Added clause 6 interest on delayed refund'."),
        }),
      }),
      /**
       * Fills the named blanks on a court form.
       *
       * Separate from proposeDocument because a prescribed form must not be
       * rewritten to insert a value: the app renders it from these values, so
       * the court's own wording and layout stay exactly as issued. Like the
       * others it has no execute -- the advocate accepts the values before
       * anything reaches the document.
       */
      ...(isFormFill
        ? {
            setFields: tool({
              description:
                "Fill in the named blanks on this court form. Use this instead of proposeDocument whenever you are supplying values for the form's fields. Only include fields you have been told a value for -- never guess a name, address, caste, tehsil or district.",
              inputSchema: z.object({
                values: z
                  .array(
                    z.object({
                      key: z.string().describe("The field key exactly as given in <form>."),
                      value: z
                        .string()
                        .describe(
                          "Plain text as it should print on the form. For a repeating table, JSON: [{\"column\":\"value\"}]."
                        ),
                    })
                  )
                  .min(1)
                  .max(60),
                summary: z
                  .string()
                  .max(200)
                  .describe("One line on what you filled in, e.g. 'Filled the court and case details'."),
              }),
            }),
          }
        : {}),
      // No execute, by design: the run stops on this call and the advocate's
      // answer, added from the UI, is what resumes it -- the same contract as
      // the askClarifyingQuestion tool in main chat and contract review.
      askClarifyingQuestion: tool({
        description:
          "Ask the advocate the one fact you need before you can draft a document that's actually usable, instead of guessing it. Use this only when a missing fact would make the draft wrong — who the parties are, what the document covers, a specific date or amount — never for a stylistic or boilerplate choice you can reasonably default. This renders as a card they answer in a click, so use it instead of putting the question in your reply. Give options when the answer is one of a known set, and leave them out when it is a fact you cannot enumerate. Ask one question at a time, never ask for something they have already told you, and say nothing else in the same turn -- the answer comes back before you continue.",
        inputSchema: z.object({
          question: z.string().min(1).max(300).describe("The question, in one line, as counsel would put it"),
          options: z
            .array(z.string().min(1).max(80))
            .min(2)
            .max(5)
            .optional()
            .describe("2-5 short answer choices, where the answer is one of a known set. Omit for an open fact such as a name, a date or an amount."),
          allowFreeText: z
            .boolean()
            .optional()
            .describe("True where the real answer may not be among the options, or where no options are given."),
        }),
      }),
    },
    stopWhen: stepCountIs(3),
    // proposeDocument returns the whole document, so this is headroom against a
    // runaway rather than a saving: a cap that truncates would be written back
    // as if it were the finished draft.
    maxOutputTokens: OUTPUT_CAPS.draftDocument,
    maxRetries: AI_MAX_RETRIES,
    experimental_transform: smoothStream({ chunking: "word" }),
    onFinish: async ({ totalUsage }) => {
      await recordAiUsage({ clerkUid: userContext.clerkUid, feature: "draft", modelKey, usage: totalUsage })
    },
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages as UIMessage[],
    onEnd: async ({ messages: finalMessages, isAborted }) => {
      if (isAborted) return
      await connectMongoWithRetry()
      // Chat history only the editor owns contentHtml through autosave.
      await DraftDocument.updateOne(
        { _id: draftId, clerkUid: userContext.clerkUid },
        { $set: { chatMessages: messagesForStorage(finalMessages) } }
      )
    },
  })
}
