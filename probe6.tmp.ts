import fs from "fs"
import { generateObject } from "ai"
import { z } from "zod"
import { modelFor } from "@/lib/ai/provider"
import { CONTRACT_REVIEW_SYSTEM_PROMPT } from "@/lib/ai/prompts"
import { trimDocumentForPrompt } from "@/lib/ai/document-context"
import { costPaise } from "@/lib/ai/rates"
import { creditsUsed } from "@/lib/ai/credits"

const analysisSchema = z.object({
  issues: z.array(z.object({
    severity: z.enum(["critical", "warning", "suggestion", "info"]),
    title: z.string().max(200), description: z.string().max(2000),
    quote: z.string().max(2000), redline: z.string().max(2000),
  })).max(40),
  summary: z.object({
    riskLevel: z.enum(["Low", "Medium", "High"]),
    summary: z.string().max(2000),
    recommendations: z.array(z.string().max(400)).max(10),
  }),
})

const SP = process.env.SP!
const text = JSON.parse(fs.readFileSync(`${SP}/extract15.json`, "utf8")).text as string
const trimmed = trimDocumentForPrompt(text)
console.log(`doc: ${text.length} chars raw -> ${trimmed.length} chars trimmed (15-page contract)\n`)

async function run(key: "fast" | "balanced" | "capable") {
  const t = Date.now()
  const { object, usage } = await generateObject({
    model: modelFor(key), system: CONTRACT_REVIEW_SYSTEM_PROMPT, schema: analysisSchema,
    prompt: `Review this contract and return every issue you find, plus an overall summary.\n\n<document>\n${trimmed}\n</document>`,
  })
  const secs = (Date.now() - t) / 1000
  const paise = costPaise(key, { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cachedInputTokens: usage.cachedInputTokens ?? 0 })
  const inr = paise / 100
  const usd = paise / 8400
  console.log(`[${key}]  ${secs.toFixed(1)}s  in=${usage.inputTokens} out=${usage.outputTokens} cached=${usage.cachedInputTokens ?? 0}  issues=${object.issues.length}`)
  console.log(`         cost: ${paise}paise = ₹${inr.toFixed(2)} = $${usd.toFixed(4)}   credits: ${creditsUsed(paise)}`)
}

;(async () => {
  for (const k of ["fast", "balanced", "capable"] as const) await run(k)
  process.exit(0)
})()
