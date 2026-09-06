import { generateObject, generateText } from "ai"
import { z } from "zod"
import { modelFor } from "@/lib/ai/provider"
import { RESEARCH_SYNTHESIS_PROMPT, RESEARCH_VERIFY_PROMPT } from "@/lib/ai/prompts"
import { OUTPUT_CAPS, AI_MAX_RETRIES, type ModelKey } from "@/lib/ai/models"
import { findCases } from "@/lib/ai/corpus-match"
import { searchCorpus } from "@/app/api/lib/corpusBackend"
import { recordAiUsage } from "./aiUsage"
import type { ChatSource } from "@/lib/ai/sources"

/**
 * The passages a draft actually cites, by their 1-based source number.
 *
 * The full source block runs to about 12k tokens, and it used to be sent three
 * times over one run -- once to synthesise, again in full to verify, and again
 * in full to rewrite. The citation checker cannot flag a citation against a
 * passage the draft never cited, so sending it the whole corpus was paying to
 * re-read text that could not change its answer.
 *
 * Falls back to every passage when a draft cites nothing at all: there is no
 * cited subset to narrow to, and the checker still has unsupported claims to
 * look for.
 */
function citedPassages<T>(draft: string, passages: T[]): T[] {
  const cited = new Set<number>()
  for (const match of draft.matchAll(/\[(\d{1,3})\]/g)) {
    const n = Number(match[1])
    if (n >= 1 && n <= passages.length) cited.add(n)
  }
  if (cited.size === 0) return passages
  return passages.filter((_, i) => cited.has(i + 1))
}

export type DeepResearchWriter = { write: (chunk: any) => void }

export type DeepResearchResult = {
  text: string
  verified: boolean
  sources: ChatSource[]
}

/**
 * Understand -> search -> draft -> verify -> (rewrite if flagged) -> reveal.
 *
 * Shared by the standalone Deep Research page and the "Deep Research" tier in
 * the main chat -- one pipeline, one place a citation-checking fix ever needs
 * to be made. Writes progress and the final answer straight to the caller's
 * UI message stream; callers only need to gate access and, if they want an
 * answer title and follow-ups, run their own epilogue on the returned text.
 */
export async function runDeepResearchPipeline({
  writer,
  clerkUid,
  plan,
  corpusId,
  query,
}: {
  writer: DeepResearchWriter
  clerkUid: string
  plan: string
  corpusId: string | null
  query: string
}): Promise<DeepResearchResult> {
  const synthesisModel: ModelKey = plan === "professional" || plan === "enterprise" ? "capable" : "balanced"

  const stage = (name: string) => writer.write({ type: "data-stage", id: "stage", data: { stage: name } })

  stage("understanding")
  const intent = await generateObject({
    model: modelFor("fast"),
    schema: z.object({
      restated: z.string().max(400).describe("The research question restated precisely"),
      subQueries: z.array(z.string().max(200)).min(1).max(3).describe("Search queries to run against the document corpus"),
    }),
    prompt: `An advocate practising in India asked this research question:\n\n${query}\n\nRestate it precisely and produce up to 3 focused search queries to find the relevant passages in their document corpus.`,
    maxOutputTokens: OUTPUT_CAPS.researchIntent,
    maxRetries: AI_MAX_RETRIES,
  })
  await recordAiUsage({ clerkUid, feature: "research", modelKey: "fast", usage: intent.usage })

  stage("searching")
  const passages: { title: string; text: string; sourceUrl: string | null }[] = []
  if (corpusId) {
    for (const sub of intent.object.subQueries) {
      if (passages.length >= 24) break
      try {
        const data = await searchCorpus({ corpusId, clerkUid, query: sub, k: 8 })
        for (const r of data.results) {
          if (passages.length >= 24) break
          if (passages.some((p) => p.text === r.text)) continue
          passages.push({ title: r.title || "Untitled document", text: r.text, sourceUrl: r.source_url ?? null })
        }
      } catch (error) {
        console.error("[RESEARCH] corpus search failed:", error)
      }
    }
  }
  const cases = await findCases(clerkUid, query, 10)

  // Numbering is assigned once, from the full list, so a passage keeps the
  // same [n] whether it is rendered in full or as part of a cited subset.
  const numbered = passages.map((p, i) => ({ ...p, n: i + 1 }))
  const renderSources = (subset: typeof numbered) =>
    subset.length
      ? subset.map((p) => `[${p.n}] (${p.title})\n${p.text.slice(0, 2000)}`).join("\n\n")
      : "(no corpus passages found)"
  const sourcesBlock = renderSources(numbered)
  const casesBlock = cases.length
    ? cases
        .map((c: any) =>
          [c.caseNo && `Case No ${c.caseNo}`, c.caseTitle, c.courtName, c.caseStage].filter(Boolean).join(" | ")
        )
        .join("\n")
    : "(no matching case files)"

  const sources: ChatSource[] = passages.map((p, i) => ({
    n: i + 1,
    title: p.title,
    url: p.sourceUrl,
    snippet: p.text.length > 320 ? `${p.text.slice(0, 320)}…` : p.text,
  }))
  writer.write({ type: "data-sources", id: "sources", data: { sources } })

  stage("drafting")
  const researchPrompt = `Research question:\n${intent.object.restated}\n\nNumbered source passages from the advocate's corpus:\n${sourcesBlock}\n\nThe advocate's own matching case files:\n${casesBlock}`
  const draft = await generateText({
    model: modelFor(synthesisModel),
    system: RESEARCH_SYNTHESIS_PROMPT,
    prompt: researchPrompt,
    maxOutputTokens: OUTPUT_CAPS.researchSynthesis,
    maxRetries: AI_MAX_RETRIES,
  })
  await recordAiUsage({ clerkUid, feature: "research", modelKey: synthesisModel, usage: draft.totalUsage })

  stage("verifying")
  let finalText = draft.text
  let verified = true
  const citedBlock = renderSources(citedPassages(draft.text, numbered))
  try {
    const verify = await generateObject({
      model: modelFor("fast"),
      schema: z.object({
        pass: z.boolean(),
        flagged: z
          .array(
            z.object({
              sentence: z.string().max(500).describe("The exact sentence from the draft being flagged"),
              problem: z.string().max(300),
            })
          )
          .max(10),
      }),
      system: RESEARCH_VERIFY_PROMPT,
      prompt: `Numbered source passages:\n${citedBlock}\n\nDraft to check:\n${draft.text}`,
      maxOutputTokens: OUTPUT_CAPS.researchVerify,
      maxRetries: AI_MAX_RETRIES,
    })
    await recordAiUsage({ clerkUid, feature: "research", modelKey: "fast", usage: verify.usage })

    if (!verify.object.pass && verify.object.flagged.length) {
      stage("rewriting")
      verified = false
      const flaggedBlock = verify.object.flagged.map((f) => `- "${f.sentence}" ${f.problem}`).join("\n")
      const rewrite = await generateText({
        model: modelFor("balanced"),
        system: RESEARCH_SYNTHESIS_PROMPT,
        // Full sources here, not the cited subset: this step is told to fix
        // wrong citations, and re-attributing a claim to the right passage
        // means being able to see a passage the draft failed to cite. It
        // only runs when verification actually fails.
        prompt: `${researchPrompt}\n\nHere is a draft answer. A citation checker flagged these sentences:\n${flaggedBlock}\n\nRewrite the draft, fixing ONLY the flagged sentences soften or remove unsupported claims, fix wrong citations, keep everything else word for word.\n\nDraft:\n${draft.text}`,
        maxOutputTokens: OUTPUT_CAPS.researchRewrite,
        maxRetries: AI_MAX_RETRIES,
      })
      await recordAiUsage({ clerkUid, feature: "research", modelKey: "balanced", usage: rewrite.totalUsage })
      finalText = rewrite.text
      verified = true
    }
  } catch (error) {
    console.error("[RESEARCH] verification failed, returning unverified draft:", error)
    verified = false
  }

  stage("done")
  writer.write({ type: "data-verified", id: "verified", data: { verified } })

  const textId = "research-answer"
  writer.write({ type: "text-start", id: textId })
  for (let i = 0; i < finalText.length; i += 400) {
    writer.write({ type: "text-delta", id: textId, delta: finalText.slice(i, i + 400) })
  }
  writer.write({ type: "text-end", id: textId })

  return { text: finalText, verified, sources }
}
