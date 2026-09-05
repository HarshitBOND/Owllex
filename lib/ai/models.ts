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
} as const

export type ModelKey = keyof typeof MODELS

export const DEFAULT_MODEL: ModelKey = "balanced"

export const PLAN_MODELS: Record<string, ModelKey[]> = {
  free: ["fast"],
  starter: ["fast", "balanced"],
  professional: ["fast", "balanced", "capable"],
  enterprise: ["fast", "balanced", "capable"],
}

// Clamps the client-requested model to what the plan allows. Unknown plans and
// unknown model strings clamp down to the cheapest allowed model, never up.
export function resolveModel(plan: string, requested: string | undefined, featureDefault: ModelKey): ModelKey {
  const allowed = PLAN_MODELS[plan] ?? PLAN_MODELS.free
  if (requested && allowed.includes(requested as ModelKey)) return requested as ModelKey
  if (allowed.includes(featureDefault)) return featureDefault
  return allowed[0]
}
