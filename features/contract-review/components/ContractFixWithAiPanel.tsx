"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai"
import { AlertCircle, ArrowUp, Check, ChevronDown, Sparkles, Wand2, X } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DEFAULT_MODEL, MODELS, type ModelKey } from "@/lib/ai/models"
import { sanitizeDraftHtml } from "@/lib/html/sanitize-draft"
import { AiLimitNotice, parseAiLimitError } from "@/components/ui/ai-limit-notice"
import { useAllowedModels } from "@/hooks/useAllowedModels"
import { severityStyles, type ContractIssue } from "../data"

interface ContractFixWithAiPanelProps {
  reviewId: string
  issues: ContractIssue[]
  resolvedIssueIds: Set<string>
  getDocumentHtml: () => string
  onApply: (html: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ContractFixWithAiPanel({
  reviewId,
  issues,
  resolvedIssueIds,
  getDocumentHtml,
  onApply,
  open,
  onOpenChange,
}: ContractFixWithAiPanelProps) {
  const router = useRouter()
  const [input, setInput] = useState("")
  const [model, setModel] = useState<ModelKey>(DEFAULT_MODEL)
  const allowedModels = useAllowedModels()
  const [applied, setApplied] = useState<Record<string, "applied" | "discarded">>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  const transport = useMemo(
    () => new DefaultChatTransport({ api: `/api/contract-review/${reviewId}/chat`, body: { model } }),
    [reviewId, model],
  )

  const { messages, sendMessage, status, addToolResult, error, clearError } = useChat({
    id: reviewId,
    transport,
  })

  const busy = status === "submitted" || status === "streaming"
  const unresolved = issues.filter((issue) => !resolvedIssueIds.has(issue.id))
  const criticalUnresolved = unresolved.filter((issue) => issue.severity === "critical")

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || busy) return
      sendMessage({ text: trimmed }, { body: { documentHtml: getDocumentHtml() } })
    },
    [busy, getDocumentHtml, sendMessage],
  )

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, status])

  const submit = () => {
    if (!input.trim()) return
    send(input)
    setInput("")
  }

  const fixIssue = (issue: ContractIssue) => {
    onOpenChange(true)
    send(
      `Fix this issue: [${issue.severity}] ${issue.title} ${issue.description}${
        issue.quote ? ` (quoting: "${issue.quote}")` : ""
      }`,
    )
  }

  const fixAllCritical = () => {
    if (criticalUnresolved.length === 0) return
    onOpenChange(true)
    send("Fix all critical issues in this contract.")
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-[400px] max-h-[75vh] flex flex-col rounded-2xl border border-gray-200 dark:border-border bg-white dark:bg-card shadow-2xl z-50 overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-border shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                <Wand2 className="w-3.5 h-3.5 text-accent" />
              </span>
              <p className="text-sm font-semibold text-gray-900 dark:text-foreground">Fix with AI</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-3 space-y-3">
            {messages.length === 0 &&
              (unresolved.length > 0 ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    {unresolved.length} issue{unresolved.length === 1 ? "" : "s"} still open. Ask AI to fix one, or
                    apply below.
                  </p>
                  {criticalUnresolved.length > 1 && (
                    <button
                      type="button"
                      onClick={fixAllCritical}
                      className="w-full h-8 rounded-lg bg-gray-900 dark:bg-accent text-white text-xs font-medium hover:opacity-90 transition-opacity"
                    >
                      Fix all critical issues ({criticalUnresolved.length})
                    </button>
                  )}
                  <div className="space-y-2">
                    {unresolved.slice(0, 8).map((issue) => {
                      const style = severityStyles[issue.severity]
                      return (
                        <div
                          key={issue.id}
                          className="flex items-start justify-between gap-2 rounded-lg border border-gray-100 dark:border-border px-3 py-2"
                        >
                          <div className="min-w-0">
                            <span
                              className={`inline-flex items-center rounded-full border ${style.badgeBorder} ${style.badgeBg} ${style.badgeText} text-[10px] font-medium px-1.5 py-0.5 mb-1`}
                            >
                              {style.label}
                            </span>
                            <p className="text-[12.5px] font-medium text-gray-900 dark:text-foreground truncate">
                              {issue.title}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => fixIssue(issue)}
                            disabled={busy}
                            className="shrink-0 h-7 px-2.5 rounded-lg border border-gray-200 dark:border-border text-[11.5px] font-medium text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-secondary transition-colors disabled:opacity-50"
                          >
                            Fix
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-center">
                  <Check className="w-6 h-6 text-emerald-500" />
                  <p className="text-[12.5px] font-medium text-gray-900 dark:text-foreground">
                    All issues resolved ask anything else below
                  </p>
                </div>
              ))}

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

              const proposal = msg.parts.find((p) => isToolUIPart(p) && getToolName(p) === "proposeFix") as
                | { toolCallId: string; state: string; input?: { html?: string; summary?: string } }
                | undefined

              return (
                <div key={msg.id} className="flex flex-col items-start">
                  {text && (
                    <p className="text-[13px] leading-relaxed text-gray-800 dark:text-foreground mb-2 whitespace-pre-wrap">
                      {text}
                    </p>
                  )}

                  {proposal?.input?.html && (
                    <div className="w-full rounded-xl border border-gray-200 dark:border-border bg-gray-50/70 dark:bg-background/40 overflow-hidden">
                      <div className="px-3.5 py-2 border-b border-gray-200 dark:border-border flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-gray-700 dark:text-foreground">Proposed fix</span>
                        {proposal.input.summary && (
                          <span className="text-[11px] text-muted-foreground truncate">{proposal.input.summary}</span>
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
                            {applied[proposal.toolCallId] === "applied" ? "Applied to the document" : "Discarded"}
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                onApply(sanitizeDraftHtml(proposal.input!.html!))
                                setApplied((p) => ({ ...p, [proposal.toolCallId]: "applied" }))
                                addToolResult({
                                  tool: "proposeFix",
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
                                  tool: "proposeFix",
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
                </div>
              )
            })}

            {busy && (
              <div className="flex items-center gap-1 px-1 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce" />
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
                    <button type="button" onClick={clearError} className="mt-1.5 text-[11px] font-medium text-amber-900 dark:text-amber-200 underline">
                      Dismiss
                    </button>
                  </div>
                )
              })()}
          </div>

          <div className="border-t border-gray-200 dark:border-border p-2.5 shrink-0">
            <div className="flex items-center gap-1.5 rounded-xl border border-bg-300 dark:border-border bg-bg-100 dark:bg-background/60 focus-within:border-accent/50 transition-colors px-2 py-1.5">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    submit()
                  }
                }}
                placeholder="Ask AI to fix a specific clause..."
                className="flex-1 min-w-0 bg-transparent text-[12.5px] text-text-100 dark:text-foreground placeholder:text-text-400 outline-none"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-6 px-1.5 rounded-lg text-[10.5px] font-medium text-text-300 hover:bg-bg-200 dark:hover:bg-secondary transition-colors flex items-center gap-0.5 shrink-0"
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
                        className={`flex-col items-start gap-0.5 ${locked ? "opacity-60" : ""}`}
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
                disabled={!input.trim() || busy}
                className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                  input.trim() && !busy ? "bg-accent text-white hover:bg-accent-hover" : "bg-accent/30 text-white/70"
                }`}
                aria-label="Send"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="fixed bottom-5 right-4 sm:right-6 z-50 inline-flex items-center gap-2 h-11 pl-4 pr-5 rounded-full bg-accent text-white text-sm font-semibold shadow-xl hover:bg-accent-hover transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        Fix with AI
        {unresolved.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-white/25 text-[10px] font-bold px-1">
            {unresolved.length}
          </span>
        )}
      </button>
    </>
  )
}
