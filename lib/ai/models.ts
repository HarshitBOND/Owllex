export const MODELS = {
  fast: { id: "gpt-5.4-mini", name: "Fast", description: "Quick answers and short drafts" },
  balanced: { id: "gpt-5.4", name: "Balanced", description: "Best for everyday legal work" },
  capable: { id: "gpt-5.6", name: "Capable", description: "Deep analysis and long documents" },
} as const

export type ModelKey = keyof typeof MODELS

export const DEFAULT_MODEL: ModelKey = "balanced"
