"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai"
import {
  AlertCircle,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  FileEdit,
  HelpCircle,
  ListChecks,
  History,
  Maximize2,
  Minimize2,
  RotateCw,
  Sparkles,
  X,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { DEFAULT_MODEL, MODELS, type ModelKey } from "@/lib/ai/models"
import { sanitizeDraftHtml } from "@/lib/html/sanitize-draft"
import { AiLimitNotice, parseAiLimitError } from "@/components/ui/ai-limit-notice"
import { useAllowedModels } from "@/hooks/useAllowedModels"

const quickActions = [
  "Add a dispute resolution clause",
  "Tighten the termination terms",
  "Add an arbitration clause with seat and venue",
]

// What the assistant is doing right now, surfaced from the live tool-call state
// rather than a generic spinner — the advocate sees drafting vs. clarifying.
const TOOL_STATUS: Record<string, { label: string; icon: typeof FileEdit }> = {
  proposeDocument: { label: "Drafting the document", icon: FileEdit },
  setFields: { label: "Filling in the form", icon: ListChecks },
  askClarification: { label: "Checking what's missing", icon: HelpCircle },
}

interface AiAssistantPanelProps {
  draftId: string
  initialMessages: UIMessage[]
  seedPrompt: string
  getDocumentHtml: () => string
  onApply: (html: string) => void
  /** Present only for a document started from a court form with named fields. */
  onApplyFields?: (values: { key: string; value: string }[]) => void
  /** Field key to the form's own wording, so values are labelled the way the court does. */
  fieldLabels?: Record<string, string>
  onClose: () => void
}

export default function AiAssistantPanel({
  draftId,
  initialMessages,
  seedPrompt,
  getDocumentHtml,
  onApply,
  onApplyFields,
  fieldLabels,
  onClose,
}: AiAssistantPanelProps) {
  const router = useRouter()
  const [value, setValue] = useState("")
  const [model, setModel] = useState<ModelKey>(DEFAULT_MODEL)
  const allowedModels = useAllowedModels()
  const [expanded, setExpanded] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [applied, setApplied] = useState<Record<string, "applied" | "discarded">>({})
  const [otherDrafts, setOtherDrafts] = useState<{ id: string; title: string }[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const seeded = useRef(false)

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/ai/draft", body: { model } }),
    [model]
  )

  const { messages, sendMessage, status, regenerate, addToolResult, error, clearError } = useChat({
    id: draftId,
    transport,
    messages: initialMessages,
  })

  const busy = status === "submitted" || status === "streaming"

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || busy) return
      sendMessage({ text: trimmed }, { body: { documentHtml: getDocumentHtml() } })
    },
    [busy, getDocumentHtml, sendMessage]
  )

  /**
   * Closes off tool calls nothing else will answer.
   *
   * None of these tools has an `execute`: they stream to the advocate and wait.
   * askClarification waits for prose, and proposeDocument/setFields wait for a
   * button. But the model's turn is only complete once every call it made has a
   * result, so a question the advocate simply answers by typing would leave a
   * dangling call -- and the NEXT request then dies with
   * AI_MissingToolResultsError, permanently breaking the conversation.
   *
   * askClarification is resolved the moment it renders, because showing the
   * questions IS its result. The two that need a decision are resolved as
   * "not accepted" only once the advocate has moved past them.
   */
  useEffect(() => {
    if (busy) return

    messages.forEach((msg, index) => {
      if (msg.role !== "assistant") return
      const isLastMessage = index === messages.length - 1

      for (const part of msg.parts) {
        if (!isToolUIPart(part)) continue

        // Only a call that has finished streaming and has no result yet.
        const state = (part as { state?: string }).state
        if (state !== "input-available") continue

        const toolCallId = (part as { toolCallId: string }).toolCallId
        const name = getToolName(part)

        if (name === "askClarification") {
          addToolResult({ tool: "askClarification", toolCallId, output: { asked: true } })
          continue
        }

        if ((name === "proposeDocument" || name === "setFields") && !isLastMessage) {
          addToolResult({ tool: name, toolCallId, output: { accepted: false } })
          setApplied((prev) => (prev[toolCallId] ? prev : { ...prev, [toolCallId]: "discarded" }))
        }
      }
    })
  }, [messages, busy, addToolResult])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, status])

  // A draft created from "Describe your document" starts drafting on its own, once.
  useEffect(() => {
    if (seeded.current || !seedPrompt || messages.length > 0) return
    seeded.current = true
    send(seedPrompt)
  }, [seedPrompt, messages.length, send])

  const submit = () => {
    if (!value.trim()) return
    send(value)
    setValue("")
  }

  const copyMessage = (id: string, text: string, html?: string) => {
    const write = html
      ? navigator.clipboard.write?.([
          new ClipboardItem({
            "text/html": new Blob([sanitizeDraftHtml(html)], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]) ?? navigator.clipboard.writeText(text)
      : navigator.clipboard.writeText(text)

    Promise.resolve(write)
      .then(() => {
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 1200)
      })
      .catch(() => {})
  }

  const openHistory = async () => {
    try {
      const res = await fetch("/api/draft-documents?limit=20")
      const data = await res.json()
      if (data.success) setOtherDrafts(data.drafts.filter((d: { id: string }) => d.id !== draftId))
    } catch {
      setOtherDrafts([])
    }
  }

  const lastIsAssistant = messages[messages.length - 1]?.role === "assistant"

  // Which step the assistant is mid-way through, read off the actual tool-call
  // state of the streaming message rather than guessed from a fixed sequence.
  const lastMessage = messages[messages.length - 1]
  const activeToolPart =
    busy && lastMessage?.role === "assistant"
      ? [...lastMessage.parts]
          .reverse()
          .find((p) => isToolUIPart(p) && p.state !== "output-available" && p.state !== "output-error")
      : undefined
  const activeStatus = activeToolPart && isToolUIPart(activeToolPart) ? TOOL_STATUS[getToolName(activeToolPart)] : undefined

  return (
    <div
      className={cn(
        "w-full shrink-0 h-[70vh] lg:h-full flex flex-col rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden transition-all duration-300",
        expanded ? "lg:w-[720px]" : "lg:w-[400px] xl:w-[430px]"
      )}
    >
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-200 dark:border-border shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-accent" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-foreground leading-tight truncate">
              Drafting assistant
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight truncate">
              Edits this document with you
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <DropdownMenu onOpenChange={(open) => open && openHistory()}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Your other documents"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
              >
                <History className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
              {otherDrafts.length === 0 ? (
                <DropdownMenuItem disabled>No other documents</DropdownMenuItem>
              ) : (
                otherDrafts.map((d) => (
                  <DropdownMenuItem key={d.id} onClick={() => router.push(`/draft-documents/${d.id}`)}>
                    <span className="truncate">{d.title}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            title={expanded ? "Shrink panel" : "Expand panel"}
            onClick={() => setExpanded((e) => !e)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
          >
            {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            title="Close assistant"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-10 px-4">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mx-auto">
              <Sparkles className="w-5 h-5 text-accent" />
            </div>
            <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-foreground">
              Describe what you need
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ask for a whole document, or a change to the one on the left. If key details are missing
              I&apos;ll ask before drafting, and nothing is applied until you approve it.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const text = msg.parts
            .filter((p) => p.type === "text")
            .map((p) => (p as { text: string }).text)
            .join("")

          if (msg.role === "user") {
            return (
              <div key={msg.id} className="flex flex-col items-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent/10 dark:bg-accent/15 px-3.5 py-2.5 text-[13px] leading-relaxed text-gray-800 dark:text-foreground whitespace-pre-wrap">
                  {text}
                </div>
              </div>
            )
          }

          const proposal = msg.parts.find(
            (p) => isToolUIPart(p) && getToolName(p) === "proposeDocument"
          ) as
            | { toolCallId: string; state: string; input?: { html?: string; summary?: string } }
            | undefined

          const fill = msg.parts.find((p) => isToolUIPart(p) && getToolName(p) === "setFields") as
            | {
                toolCallId: string
                state: string
                input?: { values?: { key: string; value: string }[]; summary?: string }
              }
            | undefined
          const filledValues = fill?.input?.values?.filter((v) => v?.key && v?.value) ?? []

          const clarification = msg.parts.find(
            (p) => isToolUIPart(p) && getToolName(p) === "askClarification"
          ) as { toolCallId: string; state: string; input?: { questions?: string[] } } | undefined
          const questions = clarification?.input?.questions?.filter(Boolean) ?? []

          return (
            <div key={msg.id} className="flex flex-col items-start">
              {text && (
                <p className="text-[13px] leading-relaxed text-gray-800 dark:text-foreground mb-2 whitespace-pre-wrap">
                  {text}
                </p>
              )}

              {questions.length > 0 && (
                <div className="w-full rounded-xl border border-accent/25 bg-accent/[0.06] overflow-hidden">
                  <div className="px-3.5 py-2 border-b border-accent/20 flex items-center gap-2">
                    <HelpCircle className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="text-[11px] font-semibold text-gray-700 dark:text-foreground">
                      A few details would help
                    </span>
                  </div>
                  <ol className="p-3.5 space-y-1.5">
                    {questions.map((q, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-[13px] leading-relaxed text-gray-800 dark:text-foreground"
                      >
                        <span className="text-accent font-medium shrink-0">{i + 1}.</span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {filledValues.length > 0 && (
                <div className="w-full rounded-xl border border-accent/25 bg-accent/[0.06] overflow-hidden">
                  <div className="px-3.5 py-2 border-b border-accent/20 flex items-center gap-2">
                    <ListChecks className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="text-[11px] font-semibold text-gray-700 dark:text-foreground">
                      Values for the form
                    </span>
                    {fill?.input?.summary && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        {fill.input.summary}
                      </span>
                    )}
                  </div>
                  <dl className="p-3.5 space-y-1.5">
                    {filledValues.map((v) => (
                      <div key={v.key} className="flex gap-2 text-[12.5px] leading-relaxed">
                        <dt className="text-muted-foreground shrink-0">
                          {fieldLabels?.[v.key] ?? v.key}
                        </dt>
                        <dd className="text-gray-800 dark:text-foreground min-w-0 break-words">
                          {v.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="px-3.5 py-2 border-t border-accent/20 flex items-center gap-2">
                    {applied[fill!.toolCallId] ? (
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        {applied[fill!.toolCallId] === "applied" ? "Filled in" : "Discarded"}
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onApplyFields?.(filledValues)
                            setApplied((p) => ({ ...p, [fill!.toolCallId]: "applied" }))
                            addToolResult({
                              tool: "setFields",
                              toolCallId: fill!.toolCallId,
                              output: { accepted: true },
                            })
                          }}
                          className="h-7 px-3 rounded-lg bg-accent text-white text-[12px] font-medium hover:bg-accent-hover transition-colors"
                        >
                          Fill these in
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setApplied((p) => ({ ...p, [fill!.toolCallId]: "discarded" }))
                            addToolResult({
                              tool: "setFields",
                              toolCallId: fill!.toolCallId,
                              output: { accepted: false },
                            })
                          }}
                          className="h-7 px-3 rounded-lg border border-gray-200 dark:border-border text-[12px] font-medium text-gray-700 dark:text-foreground hover:bg-white dark:hover:bg-secondary transition-colors"
                        >
                          Discard
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {proposal?.input?.html && (
                <div className="w-full rounded-xl border border-gray-200 dark:border-border bg-gray-50/70 dark:bg-background/40 overflow-hidden">
                  <div className="px-3.5 py-2 border-b border-gray-200 dark:border-border flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-gray-700 dark:text-foreground">
                      Proposed document
                    </span>
                    {proposal.input.summary && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        {proposal.input.summary}
                      </span>
                    )}
                  </div>
                  <div
                    className="chat-clause max-h-56 overflow-y-auto p-3.5 text-[12.5px] leading-relaxed text-gray-700 dark:text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: sanitizeDraftHtml(proposal.input.html) }}
                  />
                  <div className="px-3.5 py-2 border-t border-gray-200 dark:border-border flex items-center gap-2">
                    {applied[proposal.toolCallId] ? (
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        {applied[proposal.toolCallId] === "applied"
                          ? "Applied to the document"
                          : "Discarded"}
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onApply(sanitizeDraftHtml(proposal.input!.html!))
                            setApplied((p) => ({ ...p, [proposal.toolCallId]: "applied" }))
                            addToolResult({
                              tool: "proposeDocument",
                              toolCallId: proposal.toolCallId,
                              output: { accepted: true },
                            })
                          }}
                          className="h-7 px-3 rounded-lg bg-accent text-white text-[12px] font-medium hover:bg-accent-hover transition-colors"
                        >
                          Apply to document
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setApplied((p) => ({ ...p, [proposal.toolCallId]: "discarded" }))
                            addToolResult({
                              tool: "proposeDocument",
                              toolCallId: proposal.toolCallId,
                              output: { accepted: false },
                            })
                          }}
                          className="h-7 px-3 rounded-lg border border-gray-200 dark:border-border text-[12px] font-medium text-gray-700 dark:text-foreground hover:bg-white dark:hover:bg-secondary transition-colors"
                        >
                          Discard
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {(text || proposal || questions.length > 0) && (
                <div className="mt-1.5 flex items-center gap-0.5 text-muted-foreground">
                  <button
                    type="button"
                    title="Copy"
                    onClick={() => copyMessage(msg.id, text, proposal?.input?.html)}
                    className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
                  >
                    <Copy className={cn("w-3.5 h-3.5", copiedId === msg.id && "text-accent")} />
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {busy && (
          <div className="flex items-center gap-2 px-1 py-1 text-[12.5px] text-muted-foreground">
            {activeStatus ? (
              <activeStatus.icon className="w-3.5 h-3.5 text-accent animate-pulse shrink-0" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-accent animate-pulse shrink-0" />
            )}
            <span>{activeStatus ? `${activeStatus.label}…` : "Reading your request…"}</span>
          </div>
        )}

        {error &&
          (() => {
            const limit = parseAiLimitError(error.message)
            if (limit) return <AiLimitNotice limit={limit} />
            return (
              <div className="rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-3.5 py-2.5">
                <p className="text-[12px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{error.message || "The assistant is unavailable right now."}</span>
                </p>
                <button
                  type="button"
                  onClick={clearError}
                  className="mt-1.5 text-[11px] font-medium text-amber-900 dark:text-amber-200 underline"
                >
                  Dismiss
                </button>
              </div>
            )
          })()}
      </div>

      {!busy && lastIsAssistant && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 shrink-0">
          {quickActions.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => send(action)}
              className="px-3 py-1.5 rounded-full border border-gray-200 dark:border-border text-[12px] text-gray-700 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-secondary transition-colors"
            >
              {action}
            </button>
          ))}
          <button
            type="button"
            title="Regenerate the last reply"
            onClick={() => regenerate()}
            className="w-7 h-7 rounded-full border border-gray-200 dark:border-border flex items-center justify-center text-muted-foreground hover:bg-gray-50 dark:hover:bg-secondary transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="border-t border-gray-200 dark:border-border p-3 shrink-0">
        <div className="rounded-2xl border border-bg-300 dark:border-border bg-bg-100 dark:bg-background/60 focus-within:border-accent/50 transition-colors">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Ask for a document, or a change to this one..."
            rows={1}
            className="w-full bg-transparent resize-none px-3.5 pt-3 pb-1.5 text-[13px] text-text-100 dark:text-foreground placeholder:text-text-400 outline-none"
          />
          <div className="flex items-center justify-end px-2 pb-2">
            <div className="flex items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-7 px-2 rounded-lg text-[11px] font-medium text-text-300 hover:bg-bg-200 dark:hover:bg-secondary transition-colors flex items-center gap-1"
                  >
                    {MODELS[model].name} <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(Object.keys(MODELS) as ModelKey[]).map((key) => {
                    const locked = allowedModels ? !allowedModels.includes(key) : false
                    return (
                      <DropdownMenuItem
                        key={key}
                        onClick={() => locked ? router.push("/pricing") : setModel(key)}
                        className={cn("flex-col items-start gap-0.5", locked && "opacity-60")}
                      >
                        <span className="text-[13px] font-medium">
                          {MODELS[key].name}
                          {locked && <span className="ml-1.5 text-[10px] text-accent">Upgrade</span>}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{MODELS[key].description}</span>
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                type="button"
                onClick={submit}
                disabled={!value.trim() || busy}
                className={cn(
                  "w-7 h-7 rounded-xl flex items-center justify-center transition-colors",
                  value.trim() && !busy ? "bg-accent text-white hover:bg-accent-hover" : "bg-accent/30 text-white/70"
                )}
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
        <p className="mt-2 text-center text-[10.5px] text-muted-foreground">
          AI can make mistakes. Review the draft before you rely on it.
        </p>
      </div>
    </div>
  )
}
