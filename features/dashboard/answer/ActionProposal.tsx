"use client"

import { useEffect, useRef, useState } from "react"
import { getToolName, isToolUIPart, type UIMessage } from "ai"
import { Check, Loader2, Mail, X, Zap } from "lucide-react"
import { ACTION_TOOL, type AgentAction, type ProposeActionInput } from "@/lib/ai/actions"

/**
 * The second chat tool with no server-side execute. Where askClarifyingQuestion
 * stops the run for a fact, this one stops it for a decision: the model offers
 * to do something to the advocate's workspace, and nothing happens until they
 * accept.
 */
export { ACTION_TOOL }

export type ActionPart = {
  toolCallId: string
  state: string
  input?: Partial<ProposeActionInput>
  output?: { approved?: boolean; summary?: string; note?: string; accepted?: boolean }
}

export const isActionPart = (part: unknown): boolean =>
  isToolUIPart(part as never) && getToolName(part as never) === ACTION_TOOL

export const actionPartsOf = (message: UIMessage): ActionPart[] =>
  message.parts.filter(isActionPart) as unknown as ActionPart[]

/**
 * The proposal still waiting on a decision, if there is one.
 *
 * Only the last message is searched, for the same reason as pendingClarify:
 * addToolResult writes into the last message and nowhere else, so a proposal
 * found earlier in the thread could not be settled even if we offered to.
 */
export function pendingAction(messages: UIMessage[]): ActionPart | null {
  const last = messages[messages.length - 1]
  if (!last || last.role !== "assistant") return null
  return actionPartsOf(last).find((p) => p.input?.action && p.output === undefined) ?? null
}

/**
 * One offered action, decided in place.
 *
 * Everything reachable from here writes to the advocate's own records, and one
 * of them puts mail beyond recall, so the decision is always a deliberate click
 * -- there is no path where approving is the default or the quiet option.
 */
export function ActionProposal({
  label,
  rationale,
  action,
  output,
  disabled,
  onApprove,
  onDecline,
}: {
  label: string
  rationale: string
  action: AgentAction
  /** Present once the call is settled, which makes the card read-only. */
  output?: ActionPart["output"]
  /** The turn is still streaming, so acting now would race the model. */
  disabled?: boolean
  onApprove: (action: AgentAction) => Promise<void> | void
  onDecline: () => void
}) {
  const [running, setRunning] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [to, setTo] = useState(action.kind === "emailDocument" ? action.to : "")
  const [subject, setSubject] = useState(action.kind === "emailDocument" ? action.subject : "")
  const buttonRef = useRef<HTMLButtonElement>(null)

  const settled = output !== undefined
  // settleDanglingToolCalls closes abandoned calls with { accepted: false },
  // which is a decline by another name.
  const approved = output?.approved === true

  useEffect(() => {
    if (settled || disabled) return
    const active = document.activeElement
    if (active instanceof HTMLElement && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return
    buttonRef.current?.focus()
  }, [settled, disabled])

  if (settled) {
    return (
      <div className="w-full rounded-xl border border-bg-300 bg-bg-100/40 px-3.5 py-2.5">
        <p className="text-[12px] text-text-400 flex items-start gap-1.5">
          <Zap className="w-3.5 h-3.5 mt-px shrink-0" />
          {label}
        </p>
        <p className="mt-1 text-[13px] flex items-start gap-1.5">
          {approved ? (
            <>
              <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent" />
              <span className="text-text-100">{output?.summary ?? "Done"}</span>
            </>
          ) : (
            <>
              <X className="w-3.5 h-3.5 mt-0.5 shrink-0 text-text-400" />
              <span className="text-text-400 italic">Not done</span>
            </>
          )}
        </p>
      </div>
    )
  }

  const run = async (payload: AgentAction) => {
    setRunning(true)
    try {
      await onApprove(payload)
    } finally {
      setRunning(false)
    }
  }

  const approve = () => {
    // Mail leaves the building and cannot be recalled, so the recipient is put
    // in front of the advocate and confirmed separately -- never sent on the
    // same click that approved the idea of sending.
    if (action.kind === "emailDocument" && !confirming) {
      setConfirming(true)
      return
    }
    if (action.kind === "emailDocument") {
      void run({ ...action, to: to.trim(), subject: subject.trim() })
      return
    }
    void run(action)
  }

  const emailReady = action.kind !== "emailDocument" || (to.trim().includes("@") && subject.trim().length > 0)

  return (
    <div className="w-full rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3.5" role="group" aria-label="Suggested next step">
      <p className="text-[14px] text-text-100 flex items-start gap-2 mb-3">
        <Zap className="w-4 h-4 mt-0.5 shrink-0 text-accent" />
        {rationale}
      </p>

      {confirming && action.kind === "emailDocument" && (
        <div className="mb-3 flex flex-col gap-1.5">
          <label className="text-[11px] text-text-400">Sending to</label>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={running}
            type="email"
            className="h-9 px-3 rounded-xl border border-bg-300 bg-bg-0 text-[13px] text-text-100 outline-none focus:border-accent"
          />
          <label className="mt-1 text-[11px] text-text-400">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={running}
            className="h-9 px-3 rounded-xl border border-bg-300 bg-bg-0 text-[13px] text-text-100 outline-none focus:border-accent"
          />
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <button
          ref={buttonRef}
          type="button"
          disabled={disabled || running || !emailReady}
          onClick={approve}
          className="h-9 px-3.5 rounded-xl bg-accent text-white text-[12.5px] font-medium flex items-center gap-1.5 hover:bg-accent-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-40"
        >
          {running ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : confirming ? (
            <Mail className="w-3.5 h-3.5" />
          ) : (
            <Zap className="w-3.5 h-3.5" />
          )}
          {running ? "Working…" : confirming ? "Send it" : label}
        </button>
        <button
          type="button"
          disabled={running}
          onClick={confirming ? () => setConfirming(false) : onDecline}
          className="h-9 px-3 rounded-xl text-[12.5px] text-text-400 hover:text-text-100 hover:bg-bg-200 transition-colors disabled:opacity-50"
        >
          {confirming ? "Back" : "Not now"}
        </button>
      </div>
    </div>
  )
}
