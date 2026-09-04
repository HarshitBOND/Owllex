import type { UIMessage } from "ai"
import type { ChatSource } from "@/lib/ai/sources"

/**
 * Reads the answer card's furniture off a message. Sources, title and
 * follow-ups arrive as custom data parts on the assistant turn, so they survive
 * in Mongo and replay when the conversation is reopened.
 */

export type AnswerMeta = { title?: string; followUps?: string[] }

const dataPart = <T,>(message: UIMessage, type: string): T | null => {
  const part = message.parts.find((p) => p.type === type) as { data?: T } | undefined
  return part?.data ?? null
}

export const sourcesOf = (message: UIMessage): ChatSource[] =>
  dataPart<{ sources?: ChatSource[] }>(message, "data-sources")?.sources ?? []

export const metaOf = (message: UIMessage): AnswerMeta => dataPart<AnswerMeta>(message, "data-answer-meta") ?? {}

export const textOf = (message: UIMessage): string =>
  message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("")

/**
 * The model names most answers. When it hasn't yet (still streaming) or the
 * epilogue failed, fall back to the answer's own first heading, then to its
 * opening words -- never to a generic label, which tells the advocate nothing.
 */
export function titleOf(message: UIMessage): string {
  const given = metaOf(message).title?.trim()
  if (given) return given

  const text = textOf(message)
  const heading = text.match(/^\s{0,3}#{1,3}\s+(.+)$/m)?.[1]?.trim()
  if (heading) return heading.replace(/\s*[.:]$/, "")

  const firstLine = text.trim().split("\n")[0]?.replace(/[*_`#]/g, "").trim() ?? ""
  if (!firstLine) return "Answer"
  return firstLine.length > 70 ? `${firstLine.slice(0, 70).trimEnd()}…` : firstLine
}

export const formatAnswerDate = (value: Date) =>
  `${String(value.getDate()).padStart(2, "0")}-${String(value.getMonth() + 1).padStart(2, "0")}-${value.getFullYear()}`
