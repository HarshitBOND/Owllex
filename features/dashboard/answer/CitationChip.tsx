"use client"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { ChatSource } from "@/lib/ai/sources"

/**
 * The `[n]` marker, rendered inline. Hovering shows the passage the number
 * stands for, so the advocate can see what is being relied on without leaving
 * the sentence; clicking takes them to the row in the sources rail.
 */
export function CitationChip({
  n,
  source,
  onSelect,
}: {
  n: number
  source?: ChatSource
  onSelect?: (n: number) => void
}) {
  const chip = (
    <button
      type="button"
      onClick={() => onSelect?.(n)}
      aria-label={source ? `Source ${n}: ${source.title}` : `Source ${n}`}
      className="inline-flex items-center justify-center align-super mx-0.5 min-w-[1.15rem] h-[1.15rem] px-1 rounded text-[10px] font-medium tabular-nums bg-accent/12 text-accent hover:bg-accent/25 transition-colors cursor-pointer"
    >
      {n}
    </button>
  )

  if (!source) return chip

  return (
    <Popover>
      <PopoverTrigger asChild>{chip}</PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 p-3">
        <p className="text-[12px] font-medium text-text-100 leading-snug">{source.title}</p>
        <p className="mt-1.5 text-[12px] text-text-300 leading-relaxed line-clamp-6">{source.snippet}</p>
        {source.url && (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-[12px] text-accent hover:underline"
          >
            Open document
          </a>
        )}
      </PopoverContent>
    </Popover>
  )
}
