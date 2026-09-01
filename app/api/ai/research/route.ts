import { NextRequest, NextResponse } from "next/server"
import { generateObject, generateText, createUIMessageStream, createUIMessageStreamResponse } from "ai"
import { z } from "zod"
import { enforceRateLimit, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import Corpus from "@/app/api/lib/models/corpus"
import { modelFor } from "@/lib/ai/provider"
import { RESEARCH_SYNTHESIS_PROMPT, RESEARCH_VERIFY_PROMPT } from "@/lib/ai/prompts"
import { findCases } from "@/lib/ai/corpus-match"
import { searchCorpus } from "@/app/api/lib/corpusBackend"
import {
  checkAiAllowance,
  checkAndCountResearchRun,
  aiLimitResponse,
  recordAiUsage,
} from "@/app/api/lib/services/aiUsage"

export const maxDuration = 300

const bodySchema = z.object({
  query: z.string().trim().min(1).max(4000),
  corpusId: z.string().max(64).nullish(),
})

export async function POST(request: NextRequest) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { success: false, error: "Deep Research is not configured. Set OPENAI_API_KEY." },
      { status: 503 }
    )
  }

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `ai:research:${userContext.clerkUid}`,
    max: 10,
    windowMs: 10 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  const parsed = await parseAndValidateJson(request, bodySchema)
  if (!parsed.success) return parsed.response
  const { query, corpusId } = parsed.data

  const gate = await checkAiAllowance(userContext.clerkUid)
  if (!gate.allowed) return aiLimitResponse(gate)

  const runGate = await checkAndCountResearchRun(userContext.clerkUid, gate.snapshot)
  if (!runGate.allowed) return aiLimitResponse(runGate)

  const clerkUid = userContext.clerkUid
  const plan = gate.snapshot.plan
  const synthesisModel = plan === "professional" || plan === "enterprise" ? "capable" : "balanced"

  let activeCorpusId: string | null = null
  if (corpusId) {
    await connectMongoWithRetry()
    const corpus = await Corpus.findOne({ clerkUid, corpusId }).lean<any>()
    if (corpus) activeCorpusId = corpusId
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const stage = (name: string) =>
        writer.write({ type: "data-stage", id: "stage", data: { stage: name } })

      stage("understanding")
      const intent = await generateObject({
        model: modelFor("fast"),
        schema: z.object({
          restated: z.string().max(400).describe("The research question restated precisely"),
          subQueries: z.array(z.string().max(200)).min(1).max(3).describe("Search queries to run against the document corpus"),
        }),
        prompt: `An advocate practising in India asked this research question:\n\n${query}\n\nRestate it precisely and produce up to 3 focused search queries to find the relevant passages in their document corpus.`,
      })
      await recordAiUsage({ clerkUid, feature: "research", modelKey: "fast", usage: intent.usage })

      stage("searching")
      const passages: { title: string; text: string; sourceUrl: string | null }[] = []
      if (activeCorpusId) {
        for (const sub of intent.object.subQueries) {
          if (passages.length >= 24) break
          try {
            const data = await searchCorpus({ corpusId: activeCorpusId, clerkUid, query: sub, k: 8 })
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

      const sourcesBlock = passages.length
        ? passages.map((p, i) => `[${i + 1}] (${p.title})\n${p.text.slice(0, 2000)}`).join("\n\n")
        : "(no corpus passages found)"
      const casesBlock = cases.length
        ? cases
            .map((c: any) =>
              [c.caseNo && `Case No ${c.caseNo}`, c.caseTitle, c.courtName, c.caseStage].filter(Boolean).join(" | ")
            )
            .join("\n")
        : "(no matching case files)"

      writer.write({
        type: "data-sources",
        id: "sources",
        data: { sources: passages.map((p, i) => ({ n: i + 1, title: p.title, sourceUrl: p.sourceUrl })) },
      })

      stage("drafting")
      const researchPrompt = `Research question:\n${intent.object.restated}\n\nNumbered source passages from the advocate's corpus:\n${sourcesBlock}\n\nThe advocate's own matching case files:\n${casesBlock}`
      const draft = await generateText({
        model: modelFor(synthesisModel),
        system: RESEARCH_SYNTHESIS_PROMPT,
        prompt: researchPrompt,
      })
      await recordAiUsage({ clerkUid, feature: "research", modelKey: synthesisModel, usage: draft.totalUsage })

      stage("verifying")
      let finalText = draft.text
      let verified = true
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
          prompt: `Numbered source passages:\n${sourcesBlock}\n\nDraft to check:\n${draft.text}`,
        })
        await recordAiUsage({ clerkUid, feature: "research", modelKey: "fast", usage: verify.usage })

        if (!verify.object.pass && verify.object.flagged.length) {
          stage("rewriting")
          verified = false
          const flaggedBlock = verify.object.flagged
            .map((f) => `- "${f.sentence}" — ${f.problem}`)
            .join("\n")
          const rewrite = await generateText({
            model: modelFor("balanced"),
            system: RESEARCH_SYNTHESIS_PROMPT,
            prompt: `${researchPrompt}\n\nHere is a draft answer. A citation checker flagged these sentences:\n${flaggedBlock}\n\nRewrite the draft, fixing ONLY the flagged sentences — soften or remove unsupported claims, fix wrong citations, keep everything else word for word.\n\nDraft:\n${draft.text}`,
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
    },
    onError: (error) => {
      console.error("[RESEARCH] pipeline failed:", error)
      return "Deep Research failed. Please try again."
    },
  })

  return createUIMessageStreamResponse({ stream })
}
