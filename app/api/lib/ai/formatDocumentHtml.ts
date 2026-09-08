import * as cheerio from "cheerio"
import { generateText } from "ai"
import { modelFor } from "@/lib/ai/provider"
import { OUTPUT_CAPS, AI_MAX_RETRIES, type ModelKey } from "@/lib/ai/models"
import { DOCUMENT_FORMATTING_SYSTEM_PROMPT } from "@/lib/ai/prompts"
import { markdownToHtml } from "@/app/api/lib/html/markdownToHtml"

// One call per page, a few in flight at once -- fast enough for a normal
// contract without opening dozens of concurrent requests on a 50-page one.
const MAX_CONCURRENT_PAGES = 4
const PAGE_TIMEOUT_MS = 25_000
// Extraction (Docling/OCR) already eats into the route's 300s maxDuration;
// once formatting has spent this much wall-clock time, remaining pages skip
// the model and fall back to the deterministic converter instead of risking
// the whole upload timing out.
const TOTAL_BUDGET_MS = 150_000

type Usage = { inputTokens: number; outputTokens: number }

function stripCodeFence(text: string) {
  const trimmed = text.trim()
  const fenced = /^```(?:html)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  return fenced ? fenced[1].trim() : trimmed
}

function normalizedWords(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
}

// Cheap sanity check that the model reformatted rather than rewrote. Legal
// text that loses or gains too many words is worse unformatted than wrong --
// a page that fails this falls back to the deterministic converter.
function looksFaithful(original: string, htmlOut: string) {
  const originalWords = normalizedWords(original)
  if (originalWords.length === 0) return true
  const outputWords = new Set(normalizedWords(cheerio.load(htmlOut, null, false).text()))
  let matched = 0
  for (const word of originalWords) if (outputWords.has(word)) matched++
  return matched / originalWords.length >= 0.85
}

async function formatPage(page: string, modelKey: ModelKey): Promise<{ html: string; usage: Usage } | null> {
  try {
    const { text, usage } = await generateText({
      model: modelFor(modelKey),
      system: DOCUMENT_FORMATTING_SYSTEM_PROMPT,
      prompt: page,
      maxOutputTokens: OUTPUT_CAPS.documentFormat,
      maxRetries: AI_MAX_RETRIES,
      abortSignal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    })
    const html = stripCodeFence(text)
    if (!html || !looksFaithful(page, html)) return null
    return { html, usage: { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 } }
  } catch {
    return null
  }
}

/**
 * Restructures extracted document text into the editor's semantic HTML
 * subset (real headings, nested clause numbering, tables, signature blocks)
 * using DOCUMENT_FORMATTING_SYSTEM_PROMPT -- one model call per page, so a
 * `data-page` attribute can still be stamped on each top-level block exactly
 * as the old pagedMarkdownToHtml did for citation chips.
 *
 * Falls back to the deterministic regex converter (markdownToHtml) per page
 * whenever formatting is disabled, a call errors, times out, the response
 * isn't parseable HTML, or the output doesn't look like the same text --
 * a plain-looking but faithful result always wins over a fancier one that
 * might have quietly reworded a clause.
 */
export async function formatDocumentToHtml(opts: {
  text: string
  pages?: string[]
  modelKey: ModelKey
  aiEnabled: boolean
}): Promise<{ html: string; usage: Usage }> {
  const pages = opts.pages?.length ? opts.pages : [opts.text]
  const tagPerPage = Boolean(opts.pages?.length)

  const formatted: (string | null)[] = new Array(pages.length).fill(null)
  let totalInput = 0
  let totalOutput = 0

  if (opts.aiEnabled) {
    const startedAt = Date.now()
    for (let start = 0; start < pages.length; start += MAX_CONCURRENT_PAGES) {
      if (Date.now() - startedAt > TOTAL_BUDGET_MS) break

      const batch = pages.slice(start, start + MAX_CONCURRENT_PAGES)
      const batchResults = await Promise.all(
        batch.map((page) => (page.trim() ? formatPage(page, opts.modelKey) : null)),
      )
      batchResults.forEach((result, i) => {
        if (!result) return
        formatted[start + i] = result.html
        totalInput += result.usage.inputTokens
        totalOutput += result.usage.outputTokens
      })
    }
  }

  const html = pages
    .map((page, index) => {
      const pageHtml = formatted[index] ?? (page.trim() ? markdownToHtml(page) : "")
      if (!pageHtml.trim()) return ""
      if (!tagPerPage) return pageHtml

      const $ = cheerio.load(pageHtml, null, false)
      $.root()
        .children()
        .each((_, element) => {
          if ("tagName" in element) $(element).attr("data-page", String(index + 1))
        })
      return $.html()
    })
    .filter(Boolean)
    .join("\n")

  return { html: html || "<p></p>", usage: { inputTokens: totalInput, outputTokens: totalOutput } }
}
