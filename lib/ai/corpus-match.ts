import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import User from "@/app/api/lib/models/user"
import Case from "@/app/api/lib/models/case"
import Client from "@/app/api/lib/models/client"

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "for", "to", "is", "are", "was", "were",
  "with", "my", "our", "his", "her", "their", "this", "that", "these", "those", "at", "by",
  "from", "about", "case", "cases", "client", "clients", "matter", "matters", "file", "files",
  "have", "has", "had", "i", "we", "it", "as", "be", "been", "all", "any", "into", "regarding",
])

export function keywords(text: string) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.toLowerCase().split(/[^a-z0-9/-]+/)) {
    const word = raw.trim()
    if (word.length < 3 || STOPWORDS.has(word) || seen.has(word)) continue
    seen.add(word)
    out.push(word)
    if (out.length >= 20) break
  }
  return out
}

export const CASE_FIELDS = "caseNo caseTitle courtName courtRoom courtDate caseStage status advocate cnrNo remarks"
export const CLIENT_FIELDS = "name company email contact gstin address"

export async function ownedIds(clerkUid: string) {
  await connectMongoWithRetry()
  const user = await User.findOne({ clerkUid })
    .select("cases clients")
    .lean<{ cases?: unknown[]; clients?: unknown[] }>()
  return { caseIds: user?.cases ?? [], clientIds: user?.clients ?? [] }
}

export async function findCases(clerkUid: string, query: string | undefined, limit: number) {
  const { caseIds } = await ownedIds(clerkUid)
  if (!caseIds.length) return []

  const filter: Record<string, unknown> = { _id: { $in: caseIds } }
  const words = query?.trim() ? keywords(query) : []
  if (words.length) {
    const rx = new RegExp(words.map(escapeRegex).join("|"), "i")
    filter.$or = [
      { caseNo: rx }, { caseTitle: rx }, { courtName: rx },
      { advocate: rx }, { caseStage: rx }, { status: rx }, { cnrNo: rx },
    ]
  }

  return Case.find(filter).select(CASE_FIELDS).sort({ updatedAt: -1 }).limit(limit).lean()
}

export async function findClients(clerkUid: string, query: string | undefined, limit: number) {
  const { clientIds } = await ownedIds(clerkUid)
  if (!clientIds.length) return []

  const filter: Record<string, unknown> = { _id: { $in: clientIds } }
  const words = query?.trim() ? keywords(query) : []
  if (words.length) {
    const rx = new RegExp(words.map(escapeRegex).join("|"), "i")
    filter.$or = [{ name: rx }, { company: rx }, { email: rx }, { contact: rx }]
  }

  return Client.find(filter).select(CLIENT_FIELDS).sort({ createdAt: -1 }).limit(limit).lean()
}
