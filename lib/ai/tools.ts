import { tool, type UIMessageStreamWriter } from "ai"
import { z } from "zod"
import { findCases, findClients } from "./corpus-match"
import { formatNumberedPassage, type SourceRegistry } from "./sources"
import { searchCorpus } from "@/app/api/lib/corpusBackend"
import { searchJudgments } from "@/app/api/lib/judgmentsBackend"

/**
 * Where retrieved passages go so the UI can render them as a sources rail.
 * Optional -- without a sink the tools return unnumbered passages, which is
 * what any caller that is not streaming a UI message stream wants.
 */
export type SourceSink = {
  registry: SourceRegistry
  writer: UIMessageStreamWriter<any>
}

// Rewritten under the same id on every retrieval, so the rail fills in as the
// tool loop runs instead of appearing all at once at the end.
const publish = (sink: SourceSink | undefined) => {
  if (!sink) return
  sink.writer.write({
    type: "data-sources",
    id: "sources",
    data: { sources: sink.registry.list() },
  })
}

export function legalTools(clerkUid: string, corpusId?: string | null, sink?: SourceSink) {
  return {
    searchPublicJudgments: tool({
      description:
        "Search publicly available judgments and laws. Use this whenever the user asks for legal precedents, articles, constitutional provisions, or case law. Passages come back numbered -- cite those numbers inline as [1], [2] and never fabricate a citation.",
      inputSchema: z.object({
        query: z.string().describe("What to look for -- e.g. a case name, statute, or legal question"),
        limit: z.number().min(1).max(10).optional().describe("How many passages to return, default 5"),
      }),
      execute: async ({ query, limit }: { query: string; limit?: number }) => {
        try {
          const data = await searchJudgments({ clerkUid, query, k: limit ?? 5 })

          if (!sink) return { count: data.results.length, passages: data.results }

          const numbered = sink.registry.add(
            data.results.map((r) => ({ title: r.title, text: r.text, url: r.viewerUrl }))
          )
          publish(sink)

          return { count: numbered.length, passages: numbered.map(formatNumberedPassage) }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Judgment search is unavailable"
          return { count: 0, passages: [], error: message }
        }
      },
    }),

    searchCases: tool({
      description:
        "Search the advocate's own case files in Ravenslaw. Use whenever they ask about their cases, hearings, court dates, or matters. Returns case number, title, court, stage, status and next hearing date.",
      inputSchema: z.object({
        query: z.string().optional().describe("Text to match against case number, title, court, advocate or stage"),
        limit: z.number().min(1).max(25).optional().describe("How many cases to return, default 10"),
      }),
      execute: async ({ query, limit }) => {
        const cases = await findCases(clerkUid, query, limit ?? 10)
        return { count: cases.length, cases }
      },
    }),

    searchClients: tool({
      description:
        "Search the advocate's own client records in Ravenslaw. Use when they ask who a client is, for contact details, or which clients exist.",
      inputSchema: z.object({
        query: z.string().optional().describe("Text to match against client name, company, email or contact"),
        limit: z.number().min(1).max(25).optional().describe("How many clients to return, default 10"),
      }),
      execute: async ({ query, limit }) => {
        const clients = await findClients(clerkUid, query, limit ?? 10)
        return { count: clients.length, clients }
      },
    }),

    askClarifyingQuestion: tool({
      description:
        "Ask the advocate the one thing you need before you can answer: which side they act for, what stage the matter is at, which of two dates they mean, a case number. This renders as a card they answer in a click, so use it instead of putting the question in your reply whenever the answer is a short choice or a single fact. Give options when the answer is one of a known set, and leave them out when it is a fact you cannot enumerate. Ask one question at a time, never ask for something they have already told you, and say nothing else in the same turn -- the answer comes back before you continue.",
      inputSchema: z.object({
        question: z.string().min(1).max(300).describe("The question, in one line, as counsel would put it"),
        options: z
          .array(z.string().min(1).max(80))
          .min(2)
          .max(5)
          .optional()
          .describe(
            "The answer choices, where the answer is one of a known set -- 'I act for the complainant', 'I act for the accused'. Omit where the answer is a fact you cannot list out, such as a case number or a date."
          ),
        allowFreeText: z
          .boolean()
          .optional()
          .describe("True where the real answer may not be among the options, or where no options are given."),
      }),
      // No execute, by design: the run stops on this call and the advocate's
      // answer, added from the UI, is what resumes it.
    }),

    ...(corpusId
      ? {
          searchCorpusDocuments: tool({
            description:
              "Search the documents the advocate has uploaded into the active corpus. Use this before answering anything that turns on what those documents actually say -- pleadings, contracts, orders, correspondence. Passages come back numbered; cite those numbers inline as [1], [2] when you rely on one.",
            inputSchema: z.object({
              query: z.string().describe("What to look for in the corpus documents"),
              limit: z.number().min(1).max(10).optional().describe("How many passages to return, default 5"),
            }),
            execute: async ({ query, limit }: { query: string; limit?: number }) => {
              try {
                const data = await searchCorpus({ corpusId, clerkUid, query, k: limit ?? 5 })
                const passages = data.results.map((r) => ({
                  title: r.title || "Untitled document",
                  text: r.text,
                  url: r.source_url ?? null,
                }))

                if (!sink) {
                  return {
                    count: passages.length,
                    passages: passages.map((p) => ({ title: p.title, text: p.text, sourceUrl: p.url })),
                  }
                }

                const numbered = sink.registry.add(passages)
                publish(sink)

                return { count: numbered.length, passages: numbered.map(formatNumberedPassage) }
              } catch (error) {
                const message = error instanceof Error ? error.message : "Corpus search is unavailable"
                return { count: 0, passages: [], error: message }
              }
            },
          }),
        }
      : {}),
  }
}
