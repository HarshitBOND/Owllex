"use client"

import { useState } from "react"
import { ArrowUp, Check, Sparkles, Wand2, X } from "lucide-react"
import { fixSuggestions, severityStyles, type ContractIssue } from "../data"

interface ContractFixWithAiPanelProps {
  issues: ContractIssue[]
  fixedIssueIds: Set<string>
  onFixIssue: (issueId: string) => void
  onFixAllCritical: () => void
}

type LogEntry = { id: string; text: string }

export default function ContractFixWithAiPanel({
  issues,
  fixedIssueIds,
  onFixIssue,
  onFixAllCritical,
}: ContractFixWithAiPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState("")
  const [log, setLog] = useState<LogEntry[]>([])

  const unresolved = issues.filter((issue) => !fixedIssueIds.has(issue.id))
  const criticalAutoFixable = unresolved.filter((issue) => issue.severity === "critical" && fixSuggestions[issue.id])

  const handleFix = (issue: ContractIssue) => {
    const suggestion = fixSuggestions[issue.id]
    if (suggestion) {
      onFixIssue(issue.id)
      setLog((prev) => [
        ...prev,
        { id: `${issue.id}-${Date.now()}`, text: `Fixed "${issue.title}" — ${suggestion.note}` },
      ])
    } else {
      setLog((prev) => [
        ...prev,
        {
          id: `${issue.id}-${Date.now()}`,
          text: `"${issue.title}" needs a human — this can't be auto-fixed. Attach the missing exhibit and re-run the review.`,
        },
      ])
    }
  }

  const handleFixAllCritical = () => {
    if (criticalAutoFixable.length === 0) return
    onFixAllCritical()
    setLog((prev) => [
      ...prev,
      {
        id: `all-critical-${Date.now()}`,
        text: `Fixed ${criticalAutoFixable.length} critical issue${criticalAutoFixable.length === 1 ? "" : "s"} — see the updated clauses in the document.`,
      },
    ])
  }

  const handleSend = () => {
    if (!input.trim()) return
    setLog((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, text: input.trim() },
      {
        id: `reply-${Date.now()}`,
        text: 'I can auto-fix payment terms, the termination notice period, and the liability carve-out — click Fix next to an issue below, or say "fix all critical issues".',
      },
    ])
    setInput("")
  }

  return (
    <>
      {isOpen && (
        <div className="fixed bottom-24 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-[380px] max-h-[70vh] flex flex-col rounded-2xl border border-gray-200 dark:border-border bg-white dark:bg-card shadow-2xl z-50 overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-border shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                <Wand2 className="w-3.5 h-3.5 text-accent" />
              </span>
              <p className="text-sm font-semibold text-gray-900 dark:text-foreground">Fix with AI</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-3 space-y-3">
            {unresolved.length > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {unresolved.length} issue{unresolved.length === 1 ? "" : "s"} still open. Apply a fix, or ask below.
                </p>
                {criticalAutoFixable.length > 1 && (
                  <button
                    type="button"
                    onClick={handleFixAllCritical}
                    className="w-full h-8 rounded-lg bg-gray-900 dark:bg-accent text-white text-xs font-medium hover:opacity-90 transition-opacity"
                  >
                    Fix all critical issues ({criticalAutoFixable.length})
                  </button>
                )}
                <div className="space-y-2">
                  {unresolved.map((issue) => {
                    const style = severityStyles[issue.severity]
                    const canAutoFix = !!fixSuggestions[issue.id]
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
                          <p className="text-[12.5px] font-medium text-gray-900 dark:text-foreground truncate">{issue.title}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleFix(issue)}
                          className="shrink-0 h-7 px-2.5 rounded-lg border border-gray-200 dark:border-border text-[11.5px] font-medium text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-secondary transition-colors"
                          title={canAutoFix ? "Apply AI fix" : "This needs manual attention"}
                        >
                          {canAutoFix ? "Fix" : "Explain"}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-center">
                <Check className="w-6 h-6 text-emerald-500" />
                <p className="text-[12.5px] font-medium text-gray-900 dark:text-foreground">All fixable issues resolved</p>
              </div>
            )}

            {log.length > 0 && (
              <div className="pt-2 mt-2 border-t border-gray-100 dark:border-border space-y-2">
                {log.map((entry) => (
                  <p key={entry.id} className="text-[12px] leading-relaxed text-gray-600 dark:text-muted-foreground">
                    {entry.text}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-border p-2.5 shrink-0">
            <div className="flex items-center gap-1.5 rounded-xl border border-bg-300 dark:border-border bg-bg-100 dark:bg-background/60 focus-within:border-accent/50 transition-colors px-2 py-1.5">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Ask AI to fix a specific clause..."
                className="flex-1 min-w-0 bg-transparent text-[12.5px] text-text-100 dark:text-foreground placeholder:text-text-400 outline-none"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim()}
                className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                  input.trim() ? "bg-accent text-white hover:bg-accent-hover" : "bg-accent/30 text-white/70"
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
        onClick={() => setIsOpen((v) => !v)}
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
