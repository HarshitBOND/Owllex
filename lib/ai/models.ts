// maxOutputTokens caps generation cost per tier -- Fast stays cheap even if a
// prompt tries to talk it into a full memo; Capable gets room for a genuine
// long-document analysis. Applies per streamText call (i.e. per tool-loop
// step for chat), not cumulatively across a whole conversation.
//
// maxSteps caps the tool-calling loop for the same reason: each step that
// calls an auto-executed tool (searchPublicJudgments, searchCases, ...) and
// then writes text is a full model call billed at maxOutputTokens. A weak or
// trigger-happy model can search repeatedly and redraft its answer after
// each search instead of synthesizing once -- Fast gets the least rope,
// Capable the most, since it's expected to do real multi-source research.
export const MODELS = {
  fast: {
    id: "gpt-5.4-mini",
    name: "Fast",
    description: "Quick answers and short drafts",
    maxOutputTokens: 700,
    maxSteps: 3,
  },
  balanced: {
    id: "gpt-5.4",
    name: "Balanced",
    description: "Best for everyday legal work",
    maxOutputTokens: 2000,
    maxSteps: 4,
  },
  capable: {
    id: "gpt-5.6",
    name: "Capable",
    description: "Deep analysis and long documents",
    maxOutputTokens: 4000,
    maxSteps: 6,
  },
  // Not run through the tool-calling loop above like the other three tiers --
  // selecting it switches the chat request onto the multi-stage pipeline in
  // runDeepResearchPipeline (understand -> search -> draft -> verify ->
  // rewrite). maxOutputTokens/maxSteps exist only so this tier type-checks
  // and behaves sanely if it were ever routed through the generic path.
  research: {
    id: "gpt-5.6",
    name: "Deep Research",
    description: "Multi-source research with verified citations",
    maxOutputTokens: 4000,
    maxSteps: 6,
  },
} as const

export type ModelKey = keyof typeof MODELS

export const DEFAULT_MODEL: ModelKey = "balanced"

// "research" only means something to the main chat endpoint, which branches
// to the Deep Research pipeline instead of a plain generateText/streamText
// call -- draft assistant, contract-review fix-with-AI, and the workflow
// panel all call the model directly, so their tier pickers iterate this
// instead of every key in MODELS.
export const GENERIC_MODEL_KEYS: ModelKey[] = ["fast", "balanced", "capable"]

export const PLAN_MODELS: Record<string, ModelKey[]> = {
  trial: ["fast"],
  starter: ["fast", "balanced", "research"],
  professional: ["fast", "balanced", "capable", "research"],
  enterprise: ["fast", "balanced", "capable", "research"],
}

// Clamps the client-requested model to what the plan allows. Unknown plans and
// unknown model strings clamp down to the cheapest allowed model, never up.
export function resolveModel(plan: string, requested: string | undefined, featureDefault: ModelKey): ModelKey {
  const allowed = PLAN_MODELS[plan] ?? PLAN_MODELS.trial
  if (requested && allowed.includes(requested as ModelKey)) return requested as ModelKey
  if (allowed.includes(featureDefault)) return featureDefault
  return allowed[0]
}

// Per-call-site output caps. Output is billed at roughly 8x input, and before
// this only two of the fifteen call sites passed maxOutputTokens at all -- so a
// single uncapped generateObject could bill more than a whole conversation.
//
// These are sized for the job each call actually does, NOT set to the tier
// default. That distinction matters: revise.ts shows the hazard of a blanket
// cap, where Fast 700 tokens truncates a "return the whole document" response
// mid-stream and the truncated text is then saved over the document. The
// whole-document tools below get generous caps -- there they are a safety net
// against a runaway, not a saving.
export const OUTPUT_CAPS = {
  chatAnswerMeta: 400,
  researchIntent: 400,
  researchSynthesis: 3000,
  researchVerify: 800,
  researchRewrite: 3000,
  draftDocument: 12000,
  contractProposeFix: 12000,
  workflow: 1500,
  contractAnalyze: 12000,
  prefill: 2000,
  templateExtraction: 8000,
  templateDedupe: 500,
  corpusPreview: 1200,
} as const

// The AI SDK defaults to 2 retries, i.e. up to 3 billed attempts per call, and
// nothing in the app overrode it. One retry still absorbs a transient 500.
export const AI_MAX_RETRIES = 1

// Calls that carry their own AbortSignal.timeout get none: a call that already
// ran to its deadline once will almost always spend the same again to time out
// a second time.
export const AI_MAX_RETRIES_TIMED = 0
