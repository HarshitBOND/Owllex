"use client"

import { useState } from "react"
import { ArrowRight, HelpCircle } from "lucide-react"

interface ClarifyingQuestionCardProps {
  question: string
  options?: string[]
  allowFreeText?: boolean
  /** Present once the user has already answered -- renders read-only. */
  answer?: string
  onAnswer: (answer: string) => void
}

/**
 * One question, answered in place and advanced with a single click -- the
 * same shape as the question flow used to clarify this feature's own scope
 * with the user, so the AI's follow-up questions read the same way instead
 * of landing as a paragraph of chat text the user has to type a reply to.
 */
export default function ClarifyingQuestionCard({
  question,
  options,
  allowFreeText,
  answer,
  onAnswer,
}: ClarifyingQuestionCardProps) {
  const [freeText, setFreeText] = useState("")

  if (answer !== undefined) {
    return (
      <div className="w-full rounded-xl border border-gray-200 dark:border-border bg-gray-50/70 dark:bg-background/40 px-3.5 py-2.5">
        <p className="text-[11.5px] font-medium text-gray-500 dark:text-muted-foreground flex items-center gap-1.5 mb-1">
          <HelpCircle className="w-3.5 h-3.5" />
          {question}
        </p>
        <p className="text-[12.5px] text-gray-800 dark:text-foreground">{answer}</p>
      </div>
    )
  }

  return (
    <div className="w-full rounded-xl border border-accent/30 bg-accent/5 dark:bg-accent/10 px-3.5 py-3">
      <p className="text-[12.5px] font-medium text-gray-900 dark:text-foreground flex items-start gap-1.5 mb-2.5">
        <HelpCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent" />
        {question}
      </p>

      {options && options.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onAnswer(option)}
              className="w-full text-left h-8 px-3 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card text-[12.5px] text-gray-800 dark:text-foreground hover:border-accent hover:bg-accent/5 transition-colors"
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {allowFreeText && (
        <div className="flex items-center gap-1.5 mt-2">
          <input
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && freeText.trim()) onAnswer(freeText.trim())
            }}
            placeholder="Type your answer..."
            className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card text-[12.5px] text-gray-800 dark:text-foreground outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => freeText.trim() && onAnswer(freeText.trim())}
            disabled={!freeText.trim()}
            className="h-8 px-2.5 rounded-lg bg-accent text-white text-[12px] font-medium flex items-center gap-1 disabled:opacity-40 hover:bg-accent-hover transition-colors"
          >
            Next
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
