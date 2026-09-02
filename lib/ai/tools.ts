import { tool } from "ai"
import { z } from "zod"
import { findCases, findClients } from "./corpus-match"
import { searchCorpus } from "@/app/api/lib/corpusBackend"
import { searchJudgments } from "@/app/api/lib/judgmentsBackend"

export function legalTools(clerkUid: string, corpusId?: string | null) {
  return {
    searchPublicJudgments: tool({
      description:
        "Search publicly available judgments and laws. Use this whenever the user asks for legal precedents, articles, constitutional provisions, or case law. Always cite the title and share the viewer link -- never fabricate a citation.",
      inputSchema: z.object({
        query: z.string().describe("What to look for -- e.g. a case name, statute, or legal question"),
        limit: z.number().min(1).max(10).optional().describe("How many passages to return, default 5"),
      }),
      execute: async ({ query, limit }: { query: string; limit?: number }) => {
        try {
          const data = await searchJudgments({ clerkUid, query, k: limit ?? 5 })
          return { count: data.results.length, passages: data.results }
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

    ...(corpusId
      ? {
          searchCorpusDocuments: tool({
            description:
              "Search the documents the advocate has uploaded into the active corpus. Use this before answering anything that turns on what those documents actually say -- pleadings, contracts, orders, correspondence. Returns passages with the document title; cite the title when you rely on one.",
            inputSchema: z.object({
              query: z.string().describe("What to look for in the corpus documents"),
              limit: z.number().min(1).max(10).optional().describe("How many passages to return, default 5"),
            }),
            execute: async ({ query, limit }: { query: string; limit?: number }) => {
              try {
                const data = await searchCorpus({ corpusId, clerkUid, query, k: limit ?? 5 })
                return {
                  count: data.results.length,
                  passages: data.results.map((r) => ({
                    title: r.title || "Untitled document",
                    text: r.text,
                    sourceUrl: r.source_url ?? null,
                  })),
                }
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
