"use client"

import { ArrowUpRight } from "lucide-react"

/**
 * Suggested next questions. Like the prompt starters on the home screen these
 * load the composer rather than sending: a follow-up is usually worth a fact or
 * two of the advocate's own before it goes.
 */
export function FollowUps({ questions, onPick }: { questions: string[]; onPick: (q: string) => void }) {
  if (!questions.length) return null

  return (
    <section className="mt-4 pt-3 border-t border-bg-300">
      <p className="text-[11px] uppercase tracking-wider text-text-400 mb-1">Follow-ups</p>
      <div className="flex flex-col">
        {questions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            title="Adds this to the message box"
            className="group flex items-start gap-2 text-left py-2 text-[13px] text-text-200 hover:text-text-100 border-b border-bg-300/60 last:border-b-0 transition-colors"
          >
            <span className="flex-1 leading-snug">{q}</span>
            <ArrowUpRight className="w-3.5 h-3.5 shrink-0 mt-0.5 text-text-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </div>
    </section>
  )
}
