"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { ArrowUp, ChevronDown, Maximize2, Sparkles, X } from "lucide-react"
import { useChatThread } from "@/contexts/AiChatContext"
import { ClarifyingQuestion, clarifyPartsOf } from "@/features/dashboard/answer/ClarifyingQuestion"
import { ActionProposal, actionPartsOf } from "@/features/dashboard/answer/ActionProposal"
import { WorkCard } from "@/features/dashboard/answer/WorkCard"
import { textOf } from "@/features/dashboard/answer/answer-meta"
import type { AgentAction } from "@/lib/ai/actions"
import { cn } from "@/lib/utils"

/**
 * The assistant, following the advocate around the app.
 *
 * Approving "draft the bail application" takes them to the editor. Without this
 * the conversation that decided to draft it would be back on another page,
 * unable to say what comes after -- which is exactly when it has the most to
 * say. The dock carries the same thread onto whatever page the advocate was
 * taken to, so the next step can be proposed where they actually are.
 *
 * Deliberately not a second chat: it drives the one conversation the provider
 * owns, so anything decided here is in the thread when they go back to it.
 */

/** Routes with no conversation to carry, or no business carrying one. */
const HIDDEN_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/pricing",
  "/subscribe",
  "/contact-us",
  "/terms-of-use",
  "/admin",
]

/**
 * Routes that already have an assistant panel down the right-hand side.
 *
 * The dock still belongs on these -- the draft editor is precisely where the
 * next step gets proposed once a document exists -- but it moves to the other
 * corner so it isn't sitting on top of that panel's own composer.
 */
const RIGHT_PANEL_PREFIXES = ["/ai-workflow", "/draft-documents/"]

export default function AiChatDock() {
  const pathname = usePathname()
  const router = useRouter()
  const { isSignedIn } = useUser()
  const {
    messages,
    sendMessage,
    status,
    busy,
    answerQuestion,
    skipQuestion,
    approveAction,
    declineAction,
    settleBeforeSend,
  } = useChatThread()

  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [value, setValue] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  // The turn the advocate still has to decide on. This is what the dock exists
  // for, so it opens itself when one lands rather than waiting to be noticed.
  const last = messages[messages.length - 1]
  const pending = useMemo(() => {
    if (!last || last.role !== "assistant") return null
    const proposal = actionPartsOf(last).find((p) => p.input?.action && p.output === undefined)
    if (proposal) return { kind: "action" as const, part: proposal }
    const question = clarifyPartsOf(last).find((p) => p.input?.question && p.output === undefined)
    if (question) return { kind: "question" as const, part: question }
    return null
  }, [last])

  useEffect(() => {
    if (pending) {
      setOpen(true)
      setDismissed(false)
    }
  }, [pending])

  useEffect(() => {
    if (!open) return
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, open, status])

  const hidden =
    !isSignedIn ||
    // The landing page, and the chat screen itself -- where the full thread is
    // already on screen and a dock would be the same conversation twice.
    pathname === "/" ||
    pathname === "/dashboard" ||
    HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    messages.length === 0

  if (hidden || dismissed) return null

  const corner = RIGHT_PANEL_PREFIXES.some((prefix) => pathname.startsWith(prefix))
    ? "left-5"
    : "right-5"

  const send = async () => {
    const text = value.trim()
    if (!text || busy) return
    setValue("")
    await settleBeforeSend(text)
    sendMessage({ text })
  }

  // The tail of the thread: enough to see where the conversation got to,
  // without turning a dock into a second full transcript.
  const recent = messages.slice(-4)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-5 z-40 flex items-center gap-2 h-11 pl-3.5 pr-4 rounded-full bg-accent text-white shadow-lg hover:bg-accent-hover transition-colors",
          corner
        )}
      >
        <Sparkles className="w-4 h-4" />
        <span className="text-[13px] font-medium">Assistant</span>
        {busy && <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-pulse" />}
      </button>
    )
  }

  return (
    <div
      className={cn(
        "fixed bottom-5 z-40 w-[min(24rem,calc(100vw-2.5rem))] rounded-2xl border border-bg-300 bg-bg-0 shadow-2xl flex flex-col max-h-[min(32rem,calc(100vh-6rem))]",
        corner
      )}
    >
      <header className="flex items-center gap-2 px-3.5 py-2.5 border-b border-bg-300 shrink-0">
        <Sparkles className="w-4 h-4 text-accent shrink-0" />
        <span className="text-[13px] font-medium text-text-100 flex-1 truncate">Assistant</span>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="p-1 rounded-lg text-text-400 hover:text-text-100 hover:bg-bg-200 transition-colors"
          aria-label="Open the full conversation"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="p-1 rounded-lg text-text-400 hover:text-text-100 hover:bg-bg-200 transition-colors"
          aria-label="Minimise"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1 rounded-lg text-text-400 hover:text-text-100 hover:bg-bg-200 transition-colors"
          aria-label="Hide the assistant"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 flex flex-col gap-2.5">
        {recent.map((message) => {
          const text = textOf(message)
          const proposals = actionPartsOf(message)
          // Once answered, the question has nothing left to add -- what follows
          // speaks for it, so it drops out of the dock rather than trailing behind.
          const questions = clarifyPartsOf(message).filter((p) => p.output === undefined)

          if (!text && !questions.length && !proposals.length) return null

          return (
            <div key={message.id} className="flex flex-col gap-2">
              {text && (
                <div
                  className={cn(
                    "text-[13px] leading-relaxed rounded-xl px-3 py-2",
                    message.role === "user"
                      ? "self-end max-w-[85%] bg-accent/10 text-text-100"
                      : "text-text-200"
                  )}
                >
                  {text}
                </div>
              )}

              {questions.map((part) =>
                part.input?.question ? (
                  <ClarifyingQuestion
                    key={part.toolCallId}
                    question={part.input.question}
                    options={part.input.options}
                    allowFreeText={part.input.allowFreeText}
                    disabled={busy}
                    onAnswer={(answer) => answerQuestion(part.toolCallId, answer)}
                    onSkip={() => skipQuestion(part.toolCallId)}
                  />
                ) : null
              )}

              {proposals.map((part) =>
                part.input?.action && part.input.label && part.input.rationale ? (
                  <div key={part.toolCallId} className="flex flex-col gap-2">
                    <ActionProposal
                      label={part.input.label}
                      rationale={part.input.rationale}
                      action={part.input.action as AgentAction}
                      output={part.output}
                      disabled={busy}
                      onApprove={(action) => approveAction(part.toolCallId, action)}
                      onDecline={() => declineAction(part.toolCallId)}
                    />
                    {part.output?.approved && typeof (part.output as any).data?.draftId === "string" && (
                      <WorkCard
                        draftId={(part.output as any).data.draftId}
                        title={String((part.output as any).data.title ?? "Document")}
                      />
                    )}
                  </div>
                ) : null
              )}
            </div>
          )
        })}

        {status === "submitted" && (
          <div className="flex items-center gap-1.5 text-text-300">
            <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce [animation-delay:-0.2s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce [animation-delay:-0.1s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce" />
          </div>
        )}
      </div>

      <div className="shrink-0 p-2.5 border-t border-bg-300 flex items-center gap-1.5">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
          placeholder="Reply…"
          className="flex-1 min-w-0 h-9 px-3 rounded-xl border border-bg-300 bg-bg-100/40 text-[13px] text-text-100 placeholder:text-text-400 outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!value.trim() || busy}
          className="h-9 w-9 shrink-0 grid place-items-center rounded-xl bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-40"
          aria-label="Send"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
