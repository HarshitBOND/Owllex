import { openai } from "@ai-sdk/openai"
import { MODELS, DEFAULT_MODEL, type ModelKey } from "./models"

export function modelFor(key?: string) {
  const picked = MODELS[key as ModelKey] ?? MODELS[DEFAULT_MODEL]
  return openai(picked.id)
}
