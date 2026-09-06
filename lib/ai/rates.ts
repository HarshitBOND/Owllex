import type { ModelKey } from "./models"

// Paise per 1M tokens, at ~₹84/$. Slightly rounded up so caps err on our side.
// Override any entry via AI_RATES_JSON, e.g. {"balanced":{"input":10500,"output":84000,"cachedInput":1050}}
const DEFAULT_RATES: Record<ModelKey, { input: number; output: number; cachedInput: number }> = {
  fast: { input: 2100, output: 16800, cachedInput: 210 },
  balanced: { input: 10500, output: 84000, cachedInput: 1050 },
  capable: { input: 25200, output: 201600, cachedInput: 2520 },
  // Deep Research never bills usage against this key directly -- the pipeline
  // records each of its calls under the real tier that ran (fast/balanced/
  // capable). Present only so this rate table still covers every ModelKey.
  research: { input: 25200, output: 201600, cachedInput: 2520 },
}

export const EMBEDDING_RATE_PAISE_PER_M = 168

let rates = DEFAULT_RATES
if (process.env.AI_RATES_JSON) {
  try {
    rates = { ...DEFAULT_RATES, ...JSON.parse(process.env.AI_RATES_JSON) }
  } catch {
    console.error("[AI_RATES] AI_RATES_JSON is not valid JSON, using defaults")
  }
}

export function costPaise(
  modelKey: ModelKey,
  usage: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number }
) {
  const rate = rates[modelKey] ?? rates.balanced
  const cached = usage.cachedInputTokens ?? 0
  const input = Math.max((usage.inputTokens ?? 0) - cached, 0)
  const output = usage.outputTokens ?? 0
  const paise = (input * rate.input + cached * rate.cachedInput + output * rate.output) / 1_000_000
  return Math.max(Math.ceil(paise), 1)
}
