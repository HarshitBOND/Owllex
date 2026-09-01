export const MODELS = {
  fast: { id: "gpt-5.4-mini", name: "Fast", description: "Quick answers and short drafts" },
  balanced: { id: "gpt-5.4", name: "Balanced", description: "Best for everyday legal work" },
  capable: { id: "gpt-5.6", name: "Capable", description: "Deep analysis and long documents" },
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
