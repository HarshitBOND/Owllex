"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { FileText, Loader2 } from "lucide-react"

/**
 * The handle an approved action leaves behind in the thread.
 *
 * Approving "draft the bail application" takes the advocate to the editor, and
 * without this the conversation would have nothing to show for it -- scrolling
 * back a week later would find a sentence saying a document was drafted and no
 * way to reach it. The card stays in the thread and opens the document.
 *
 * It holds only the id: the title, status and length are read back from the
 * document itself each time the card renders. That is what lets it say
 * "Drafting…" while the work is happening on another page and "Drafted" when
 * the advocate comes back, without anything having to report progress across
 * the route change.
 */
export function WorkCard({ draftId, title }: { draftId: string; title: string }) {
  const router = useRouter()
  const [state, setState] = useState<{ title: string; wordCount: number; status: string } | null>(null)
  const [gone, setGone] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    // Stops the poll running forever behind an abandoned tab if a draft never
    // gets any content -- a failed generation, or one the advocate cleared.
    let attempts = 0

    const read = async () => {
      try {
        const response = await fetch(`/api/draft-documents/${draftId}`)
        if (response.status === 404) {
          if (!cancelled) setGone(true)
          return
        }
        const data = await response.json()
        if (cancelled || !data?.document) return

        setState({
          title: data.document.title,
          wordCount: data.document.wordCount ?? 0,
          status: data.document.status,
        })

        attempts++
        if (data.document.wordCount > 0 || attempts > 30) return
        timer.current = window.setTimeout(read, 4000)
      } catch {
        /* Leave the last good state on screen; the card is not worth an error. */
      }
    }

    read()
    return () => {
      cancelled = true
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [draftId])

  if (gone) return null

  const drafting = state !== null && state.wordCount === 0
  const shown = state?.title || title

  return (
    <button
      type="button"
      onClick={() => router.push(`/draft-documents/${draftId}`)}
      className="group w-full text-left flex items-center gap-3 rounded-xl border border-bg-300 bg-bg-0 px-3.5 py-3 transition-colors hover:border-accent hover:bg-accent/5 focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
    >
      <span className="w-9 h-9 shrink-0 grid place-items-center rounded-lg bg-bg-200 text-text-300 group-hover:bg-accent/15 group-hover:text-accent">
        {drafting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-text-100">{shown}</span>
        <span className="block text-[11.5px] text-text-400">
          {state === null
            ? "Opening…"
            : drafting
              ? "Drafting…"
              : `${state.status === "final" ? "Final" : "Draft"} · ${state.wordCount.toLocaleString()} words`}
        </span>
      </span>
      <span className="shrink-0 text-[11.5px] text-text-400 group-hover:text-accent">Open</span>
    </button>
  )
}
