"use client"

import { useEffect, useRef, useState } from "react"
import { getToolName, isToolUIPart, type UIMessage } from "ai"
import { ArrowRight, HelpCircle, Pencil } from "lucide-react"

/**
 * The one chat tool with no server-side execute. The model calls it and the run
 * stops there; the advocate's answer, added in the UI, is what resumes it.
 *
 * Shared across every AI surface in the app (main chat, contract review,
 * draft documents) so a clarifying question always looks and behaves the
 * same way, however the request that produced it got there.
 */
export const CLARIFY_TOOL = "askClarifyingQuestion"

export type ClarifyPart = {
  toolCallId: string
  state: string
  input?: { question?: string; options?: string[]; allowFreeText?: boolean }
  output?: { answer?: string; skipped?: boolean }
}

export const isClarifyPart = (part: unknown): boolean =>
  isToolUIPart(part as never) && getToolName(part as never) === CLARIFY_TOOL

export const clarifyPartsOf = (message: UIMessage): ClarifyPart[] =>
  message.parts.filter(isClarifyPart) as unknown as ClarifyPart[]

/**
 * The question the assistant is still waiting on, if there is one.
 *
 * Only the last message is searched: `addToolResult` writes into the last
 * message and nowhere else, so a call found earlier in the thread could not be
 * settled even if we offered to.
 */
export function pendingClarify(messages: UIMessage[]): ClarifyPart | null {
  const last = messages[messages.length - 1]
  if (!last || last.role !== "assistant") return null
  return clarifyPartsOf(last).find((p) => p.input?.question && p.output === undefined) ?? null
}

/**
 * One question, answered in place.
 *
 * The alternative -- the model writing "tell me which side you act for" into
 * the answer and waiting for a typed reply -- costs the advocate a round trip
 * for something that is two words and a click. Options are numbered and driven
 * from the keyboard, so answering is one keystroke without leaving the thread.
 *
 * Callers only render this while the call is unsettled -- once answered, the
 * question drops out of the thread entirely rather than sticking around as a
 * read-only summary.
 */
export function ClarifyingQuestion({
  question,
  options,
  allowFreeText,
  disabled,
  onAnswer,
  onSkip,
}: {
  question: string
  options?: string[]
  allowFreeText?: boolean
  /** The turn is still streaming, so an answer now would race the model. */
  disabled?: boolean
  onAnswer: (answer: string) => void
  onSkip: () => void
}) {
  const [writing, setWriting] = useState(false)
  const [text, setText] = useState("")
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const focused = useRef(false)

  const choices = options ?? []
  // A question with nothing to pick from is a free-text question whether or not
  // the model remembered to say so.
  const freeText = allowFreeText || choices.length === 0

  // Focus the first choice once, so the question can be answered from the
  // keyboard the moment it lands -- but never steal the cursor out of a box the
  // advocate is already typing in.
  useEffect(() => {
    if (disabled || focused.current) return
    const active = document.activeElement
    if (active instanceof HTMLElement && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return
    focused.current = true
    if (choices.length) rowRefs.current[0]?.focus()
    else inputRef.current?.focus()
  }, [disabled, choices.length])

  useEffect(() => {
    if (writing) inputRef.current?.focus()
  }, [writing])

  const rowCount = choices.length + (freeText ? 1 : 0)

  const move = (delta: number) => {
    const current = rowRefs.current.findIndex((el) => el === document.activeElement)
    const next = (((current === -1 ? 0 : current) + delta) % rowCount + rowCount) % rowCount
    rowRefs.current[next]?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    // Inside the free-text box the arrows move the caret and the digits are
    // part of the answer, so the list shortcuts stay out of the way.
    if (writing || event.target instanceof HTMLInputElement) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      move(event.key === "ArrowDown" ? 1 : -1)
      return
    }
    // The number beside a choice picks it, the way the hint line promises.
    if (/^[1-9]$/.test(event.key)) {
      const choice = choices[Number(event.key) - 1]
      if (choice) {
        event.preventDefault()
        onAnswer(choice)
      }
    }
  }

  const submitText = () => {
    const trimmed = text.trim()
    if (trimmed) onAnswer(trimmed)
  }

  return (
    <div
      className="w-full rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3.5"
      onKeyDown={onKeyDown}
      role="group"
      aria-label="Question from the assistant"
    >
      <p className="text-[14px] font-medium text-text-100 flex items-start gap-2 mb-3">
        <HelpCircle className="w-4 h-4 mt-0.5 shrink-0 text-accent" />
        {question}
      </p>

      <div className="flex flex-col gap-1.5">
        {choices.map((choice, index) => (
          <button
            key={choice}
            ref={(el) => {
              rowRefs.current[index] = el
            }}
            type="button"
            disabled={disabled}
            onClick={() => onAnswer(choice)}
            className="group w-full text-left flex items-center gap-2.5 min-h-9 px-2.5 py-1.5 rounded-xl border border-bg-300 bg-bg-0 text-[13px] text-text-100 transition-colors hover:border-accent hover:bg-accent/5 focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-50"
          >
            <span className="w-5 h-5 shrink-0 grid place-items-center rounded-md bg-bg-200 text-[11px] text-text-400 group-hover:bg-accent/15 group-hover:text-accent group-focus-visible:bg-accent/15 group-focus-visible:text-accent">
              {index + 1}
            </span>
            {choice}
          </button>
        ))}

        {freeText &&
          (writing || choices.length === 0 ? (
            <div className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    submitText()
                  }
                  if (e.key === "Escape" && choices.length) setWriting(false)
                }}
                disabled={disabled}
                placeholder="Type your answer…"
                className="flex-1 min-w-0 h-9 px-3 rounded-xl border border-bg-300 bg-bg-0 text-[13px] text-text-100 placeholder:text-text-400 outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={submitText}
                disabled={disabled || !text.trim()}
                className="h-9 px-3 rounded-xl bg-accent text-white text-[12.5px] font-medium flex items-center gap-1 hover:bg-accent-hover transition-colors disabled:opacity-40"
              >
                Send
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                ref={(el) => {
                  rowRefs.current[choices.length] = el
                }}
                type="button"
                disabled={disabled}
                onClick={() => setWriting(true)}
                className="group flex-1 text-left flex items-center gap-2.5 min-h-9 px-2.5 py-1.5 rounded-xl border border-transparent text-[13px] text-text-300 transition-colors hover:bg-bg-200 hover:text-text-100 focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-50"
              >
                <span className="w-5 h-5 shrink-0 grid place-items-center rounded-md bg-bg-200 text-text-400 group-hover:text-text-100">
                  <Pencil className="w-3 h-3" />
                </span>
                Something else
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={onSkip}
                className="h-9 px-3 rounded-xl text-[12.5px] text-text-400 hover:text-text-100 hover:bg-bg-200 transition-colors disabled:opacity-50"
              >
                Skip
              </button>
            </div>
          ))}
      </div>

      {choices.length > 0 && (
        <p className="mt-2.5 text-[11px] text-text-400">
          <kbd className="font-sans">↑↓</kbd> to move · <kbd className="font-sans">1-{choices.length}</kbd> or{" "}
          <kbd className="font-sans">Enter</kbd> to pick · or reply in the message box
        </p>
      )}
    </div>
  )
}
