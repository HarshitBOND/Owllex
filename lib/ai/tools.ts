import { tool } from "ai"
import { z } from "zod"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import User from "@/app/api/lib/models/user"
import Case from "@/app/api/lib/models/case"
import Client from "@/app/api/lib/models/client"

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export function legalTools(clerkUid: string) {
  return {
    searchCases: tool({
      description:
        "Search the advocate's own case files in LexVert. Use whenever they ask about their cases, hearings, court dates, or matters. Returns case number, title, court, stage, status and next hearing date.",
      inputSchema: z.object({
        query: z.string().optional().describe("Text to match against case number, title, court, advocate or stage"),
        limit: z.number().min(1).max(25).optional().describe("How many cases to return, default 10"),
      }),
      execute: async ({ query, limit }) => {
        await connectMongoWithRetry()
        const user = await User.findOne({ clerkUid }).select("cases").lean<{ cases?: unknown[] }>()
        if (!user?.cases?.length) return { count: 0, cases: [] }

        const filter: Record<string, unknown> = { _id: { $in: user.cases } }
        if (query?.trim()) {
          const rx = new RegExp(escape(query.trim()), "i")
          filter.$or = [
            { caseNo: rx }, { caseTitle: rx }, { courtName: rx },
            { advocate: rx }, { caseStage: rx }, { status: rx }, { cnrNo: rx },
          ]
        }

        const rows = await Case.find(filter)
          .select("caseNo caseTitle courtName courtRoom courtDate caseStage status advocate cnrNo remarks")
          .sort({ updatedAt: -1 })
          .limit(limit ?? 10)
          .lean()

        return { count: rows.length, cases: rows }
      },
    }),

    searchClients: tool({
      description:
        "Search the advocate's own client records in LexVert. Use when they ask who a client is, for contact details, or which clients exist.",
      inputSchema: z.object({
        query: z.string().optional().describe("Text to match against client name, company, email or contact"),
        limit: z.number().min(1).max(25).optional().describe("How many clients to return, default 10"),
      }),
      execute: async ({ query, limit }) => {
        await connectMongoWithRetry()
        const user = await User.findOne({ clerkUid }).select("clients").lean<{ clients?: unknown[] }>()
        if (!user?.clients?.length) return { count: 0, clients: [] }

        const filter: Record<string, unknown> = { _id: { $in: user.clients } }
        if (query?.trim()) {
          const rx = new RegExp(escape(query.trim()), "i")
          filter.$or = [{ name: rx }, { company: rx }, { email: rx }, { contact: rx }]
        }

        const rows = await Client.find(filter)
          .select("name company email contact gstin address")
          .sort({ createdAt: -1 })
          .limit(limit ?? 10)
          .lean()

        return { count: rows.length, clients: rows }
      },
    }),
  }
}
