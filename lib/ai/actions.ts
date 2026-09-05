import { z } from "zod"

/**
 * The actions the assistant can offer to carry out for the advocate.
 *
 * The tool that proposes these has no `execute` (see lib/ai/tools.ts), so the
 * run halts on the call and the advocate's approval, added from the UI, is what
 * resumes it. That makes every action here a decision the advocate took, not
 * one the model took on their behalf -- which is the only safe footing for
 * something that creates records, drafts into the workspace, prints, or sends
 * mail out of the building.
 *
 * This schema is the contract between the tool definition on the server and the
 * handler registry on the client. Both import it, so the two cannot drift.
 */

/** The one chat tool that acts rather than answers. Mirrors CLARIFY_TOOL. */
export const ACTION_TOOL = "proposeAction"

/**
 * A fact the assistant gathered in conversation and is offering to remember.
 *
 * Keyed rather than free text, because the corpus stores facts by key and looks
 * them up by exact match when the next form opens -- "court_name" typed once is
 * what stops the same question being asked on every subsequent draft.
 */
export const agentFactSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, "snake_case, starting with a letter")
    .max(60)
    .describe("Stable snake_case key for this fact -- court_name, fir_no, accused_name, police_station"),
  label: z.string().min(1).max(80).describe("How the fact would be labelled on a form"),
  value: z.string().min(1).max(2000).describe("The value exactly as it should be recorded"),
})

export type AgentFact = z.infer<typeof agentFactSchema>

export const saveToCorpusSchema = z.object({
  kind: z.literal("saveToCorpus"),
  corpusName: z.string().min(1).max(120).describe("A name for the matter, as it would appear on a file cover"),
  description: z.string().max(2000).default("").describe("One or two lines describing the matter"),
  facts: z
    .array(agentFactSchema)
    .max(40)
    .describe("The facts established in this conversation, to be remembered against the matter"),
})

export const draftDocumentSchema = z.object({
  kind: z.literal("draftDocument"),
  title: z.string().min(1).max(200).describe("Title for the document, e.g. 'Anticipatory Bail Application'"),
  instrument: z
    .string()
    .min(1)
    .max(80)
    .describe("The kind of instrument in a few words -- 'anticipatory bail application', 'written statement'"),
  // Capped to match the seedPrompt column this is written into
  // (app/api/draft-documents/route.ts), which truncates at 2000.
  instructions: z
    .string()
    .min(1)
    .max(2000)
    .describe(
      "What the draft must contain: the parties, court, provision invoked, and the facts and grounds it turns on. Written as instructions to a junior, not as the document itself."
    ),
})

export const generateWorkflowSchema = z.object({
  kind: z.literal("generateWorkflow"),
  title: z.string().min(1).max(120).describe("A name for the workflow"),
  brief: z
    .string()
    .min(1)
    .max(2000)
    .describe("What the workflow should cover, from intake through to filing, including where it branches"),
})

export const printDocumentSchema = z.object({
  kind: z.literal("printDocument"),
  draftId: z.string().regex(/^[a-f\d]{24}$/i).describe("Id of a draft that already exists in this conversation"),
  title: z.string().min(1).max(200),
})

export const emailDocumentSchema = z.object({
  kind: z.literal("emailDocument"),
  draftId: z.string().regex(/^[a-f\d]{24}$/i).describe("Id of a draft that already exists in this conversation"),
  to: z.string().email().describe("The recipient's email address, as the advocate gave it"),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(4000).describe("The covering note, in the advocate's professional register"),
})

export const ActionSchema = z.discriminatedUnion("kind", [
  saveToCorpusSchema,
  draftDocumentSchema,
  generateWorkflowSchema,
  printDocumentSchema,
  emailDocumentSchema,
])

export type AgentAction = z.infer<typeof ActionSchema>
export type ActionKind = AgentAction["kind"]

/** The tool input: the action itself, plus how it is put to the advocate. */
export const proposeActionInputSchema = z.object({
  label: z
    .string()
    .min(1)
    .max(80)
    .describe("The button, as an instruction to act -- 'Draft the anticipatory bail application'"),
  rationale: z
    .string()
    .min(1)
    .max(300)
    .describe("One line on why this is the right next step, in the same voice as the rest of your advice"),
  action: ActionSchema,
})

export type ProposeActionInput = z.infer<typeof proposeActionInputSchema>

/**
 * What a handler hands back once the advocate approves.
 *
 * `summary` is written back into the conversation as the tool result, so it is
 * what the model reads to decide what to propose next -- keep it factual and
 * short. `data` carries ids forward (a draftId a later print or email needs).
 */
export type ActionResult = {
  ok: boolean
  summary: string
  data?: Record<string, unknown>
}

/** What the UI records on the settled tool call, for the card and the model alike. */
export type ActionOutput =
  | { approved: true; summary: string; data?: Record<string, unknown> }
  | { approved: false; note: string }
