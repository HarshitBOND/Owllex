"use client"

import { useEffect, useState } from "react"
import { AlertCircle, Check, CheckCircle2, ChevronDown, ChevronRight, Info, Sparkles } from "lucide-react"
import { severityStyles, type ContractIssue, type ContractSummary, type IssueSeverity } from "../data"

interface ContractInsightsPanelProps {
  isAnalyzing: boolean
  error?: string | null
  issues: ContractIssue[]
  summary: ContractSummary | null
  selectedIssueId: string | null
  onSelectIssue: (id: string) => void
  resolvedIssueIds: Set<string>
  onToggleResolved: (id: string) => void
  onOpenChat: () => void
}

const tabs: Array<{ key: "all" | IssueSeverity; label: string }> = [
  { key: "all", label: "All issues" },
  { key: "critical", label: "Critical" },
  { key: "warning", label: "Warnings" },
  { key: "suggestion", label: "Suggestions" },
]

export default function ContractInsightsPanel({
  isAnalyzing,
  error,
  issues,
  summary,
  selectedIssueId,
  onSelectIssue,
  resolvedIssueIds,
  onToggleResolved,
  onOpenChat,
}: ContractInsightsPanelProps) {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("all")
  const [summaryExpanded, setSummaryExpanded] = useState(false)

  useEffect(() => {
    const stored = window.localStorage.getItem("contract-review:summary-expanded")
    if (stored !== null) setSummaryExpanded(stored === "true")
  }, [])

  const toggleSummaryExpanded = () => {
    setSummaryExpanded((prev) => {
      const next = !prev
      window.localStorage.setItem("contract-review:summary-expanded", String(next))
      return next
    })
  }

  const filteredIssues = issues.filter((issue) => tab === "all" || issue.severity === tab)
  const counts = {
    all: issues.length,
    critical: issues.filter((i) => i.severity === "critical").length,
    warning: issues.filter((i) => i.severity === "warning").length,
    suggestion: issues.filter((i) => i.severity === "suggestion").length,
    info: issues.filter((i) => i.severity === "info").length,
  }
  const stats = [
    { label: "Issues", value: counts.critical, style: severityStyles.critical },
    { label: "Warnings", value: counts.warning, style: severityStyles.warning },
    { label: "Suggestions", value: counts.suggestion, style: severityStyles.suggestion },
    { label: "Info", value: counts.info, style: severityStyles.info },
  ]

  return (
    <div className="w-full h-full flex flex-col rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden">
      <div className="border-b border-gray-200 dark:border-border shrink-0">
        <button
          type="button"
          onClick={toggleSummaryExpanded}
          className="w-full flex items-center gap-1.5 px-4 py-4"
          aria-expanded={summaryExpanded}
        >
          <h2 className="text-sm font-semibold text-gray-900 dark:text-foreground">Review summary</h2>
          {summary && (
            <span
              className={`inline-flex items-center rounded-full border text-[10px] font-medium px-1.5 py-0.5 ml-auto ${
                summary.riskLevel === "High"
                  ? "border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400"
                  : summary.riskLevel === "Medium"
                    ? "border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400"
                    : "border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400"
              }`}
            >
              {summary.riskLevel} risk
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${summaryExpanded ? "" : "-rotate-90"} ${summary ? "" : "ml-auto"}`} />
        </button>
        {summaryExpanded && (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-4 gap-2">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className={`rounded-lg border ${stat.style.badgeBorder} ${stat.style.badgeBg} px-2 py-2 text-center`}
                >
                  <p className={`text-base font-bold ${stat.style.badgeText}`}>{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
            {summary?.summary && (
              <p className="mt-3 text-[12.5px] leading-relaxed text-gray-600 dark:text-muted-foreground">
                {summary.summary}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 dark:border-border overflow-x-auto custom-scrollbar shrink-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              tab === t.key
                ? "bg-gray-900 dark:bg-accent text-white"
                : "text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary"
            }`}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar divide-y divide-gray-100 dark:divide-border">
        {isAnalyzing ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <div className="w-6 h-6 border-2 border-t-transparent border-accent rounded-full animate-spin" />
            Analyzing contract…
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center px-6">
            <AlertCircle className="w-6 h-6 text-red-500" />
            <p className="text-sm font-medium text-gray-900 dark:text-foreground">Review failed</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : filteredIssues.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-12 text-sm text-muted-foreground text-center px-6">
            No issues in this category.
          </div>
        ) : (
          filteredIssues.map((issue) => {
            const style = severityStyles[issue.severity]
            const isSelected = selectedIssueId === issue.id
            const isResolved = resolvedIssueIds.has(issue.id)
            return (
              <div
                key={issue.id}
                className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors ${
                  isResolved ? "opacity-60" : isSelected ? "bg-accent/5" : "hover:bg-gray-50 dark:hover:bg-secondary/40"
                }`}
              >
                <button type="button" onClick={() => onSelectIssue(issue.id)} className="flex items-start gap-3 flex-1 min-w-0 text-left">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-white shrink-0 mt-0.5 ${
                      isResolved ? "bg-brand-500" : style.dot
                    }`}
                  >
                    {isResolved && <Check className="w-3 h-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className={
                          isResolved
                            ? "inline-flex items-center rounded-full border border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 text-[10px] font-medium px-1.5 py-0.5"
                            : `inline-flex items-center rounded-full border ${style.badgeBorder} ${style.badgeBg} ${style.badgeText} text-[10px] font-medium px-1.5 py-0.5`
                        }
                      >
                        {isResolved ? "Resolved" : style.label}
                      </span>
                      <span
                        className={`text-[13px] font-semibold ${
                          isResolved ? "line-through text-gray-400 dark:text-muted-foreground" : "text-gray-900 dark:text-foreground"
                        }`}
                      >
                        {issue.title}
                      </span>
                    </span>
                    <span className="block text-[12.5px] text-muted-foreground leading-snug mb-1.5">
                      {issue.description}
                    </span>
                    {issue.redline && (
                      <span className="block text-[11.5px] text-gray-500 dark:text-muted-foreground/80 leading-snug italic">
                        Suggested: {issue.redline}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleResolved(issue.id)}
                  title={isResolved ? "Mark unresolved" : "Mark resolved"}
                  className={`shrink-0 mt-0.5 transition-colors ${
                    isResolved ? "text-brand-500" : "text-gray-300 dark:text-muted-foreground hover:text-brand-500"
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </div>
            )
          })
        )}
      </div>

      <button
        type="button"
        onClick={onOpenChat}
        className="flex items-center gap-3 px-4 py-3.5 border-t border-gray-200 dark:border-border shrink-0 text-left hover:bg-gray-50 dark:hover:bg-secondary/40 transition-colors"
      >
        <span className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-accent" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-gray-900 dark:text-foreground">
            Ask AI about this contract
          </span>
          <span className="block text-[11.5px] text-muted-foreground">
            Get detailed explanations or ask specific questions
          </span>
        </span>
        <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
      </button>
      {!error && !isAnalyzing && (
        <p className="flex items-center gap-1 px-4 pb-3 text-[11px] text-muted-foreground">
          <Info className="w-3 h-3 shrink-0" />
          Click an issue to jump to it in the document, or the arrow to mark it resolved.
        </p>
      )}
    </div>
  )
}
