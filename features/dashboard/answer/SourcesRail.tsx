"use client"

import { useMemo } from "react"
import { ChevronDown, FileText } from "lucide-react"
import type { ChatSource } from "@/lib/ai/sources"

/**
 * The sources beside an answer, grouped the way the advocate thinks about them:
 * one row per document, carrying the citation numbers that point into it. The
 * numbers are the same ones the model wrote in the prose.
 */

export const sourceRowId = (messageId: string, title: string) =>
  `src-${messageId}-${title.replace(/[^\w]+/g, "-").slice(0, 40)}`

type Group = { title: string; url: string | null; numbers: number[] }

export function useSourceGroups(sources: ChatSource[]): Group[] {
  return useMemo(() => {
    const groups = new Map<string, Group>()
    for (const s of sources) {
      const existing = groups.get(s.title)
      if (existing) {
        existing.numbers.push(s.n)
        existing.url ??= s.url
      } else {
        groups.set(s.title, { title: s.title, url: s.url, numbers: [s.n] })
      }
    }
    return [...groups.values()]
  }, [sources])
}

export function SourcesRail({
  messageId,
  sources,
  activeN,
}: {
  messageId: string
  sources: ChatSource[]
  activeN: number | null
}) {
  const groups = useSourceGroups(sources)
  if (!groups.length) return null

  return (
    <aside className="hidden lg:block w-60 shrink-0" aria-label="Sources">
      <div className="sticky top-0 rounded-xl border border-bg-300 bg-bg-100/50 p-3">
        <p className="text-[11px] uppercase tracking-wider text-text-400 mb-2.5">Sources</p>
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <SourceRow key={g.title} id={sourceRowId(messageId, g.title)} group={g} activeN={activeN} />
          ))}
        </div>
      </div>
    </aside>
  )
}

/** Below lg the rail has nowhere to sit, so it folds under the answer instead. */
export function SourcesDisclosure({
  messageId,
  sources,
  activeN,
}: {
  messageId: string
  sources: ChatSource[]
  activeN: number | null
}) {
  const groups = useSourceGroups(sources)
  if (!groups.length) return null

  return (
    <details className="lg:hidden group rounded-xl border border-bg-300 bg-bg-100/50 px-3 py-2">
      <summary className="flex items-center gap-1.5 cursor-pointer list-none text-[12px] text-text-300">
        <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
        {sources.length} {sources.length === 1 ? "source" : "sources"}
      </summary>
      <div className="flex flex-col gap-3 mt-2.5">
        {groups.map((g) => (
          <SourceRow key={g.title} id={`m-${sourceRowId(messageId, g.title)}`} group={g} activeN={activeN} />
        ))}
      </div>
    </details>
  )
}

function SourceRow({ id, group, activeN }: { id: string; group: Group; activeN: number | null }) {
  const highlighted = activeN !== null && group.numbers.includes(activeN)

  return (
    <div
      id={id}
      className={`rounded-lg -mx-1 px-1 py-1 transition-colors ${highlighted ? "bg-accent/10" : ""}`}
    >
      <div className="flex items-start gap-1.5">
        <FileText className="w-3.5 h-3.5 text-text-400 shrink-0 mt-0.5" />
        {group.url ? (
          <a
            href={group.url}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] leading-snug text-text-200 hover:text-accent hover:underline break-words"
          >
            {group.title}
          </a>
        ) : (
          <span className="text-[12px] leading-snug text-text-200 break-words">{group.title}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5 pl-5">
        {group.numbers.map((n) => (
          <span
            key={n}
            className={`inline-flex items-center justify-center min-w-[1.15rem] h-[1.15rem] px-1 rounded text-[10px] tabular-nums transition-colors ${
              n === activeN ? "bg-accent text-white" : "bg-bg-300/70 text-text-300"
            }`}
          >
            {n}
          </span>
        ))}
      </div>
    </div>
  )
}
