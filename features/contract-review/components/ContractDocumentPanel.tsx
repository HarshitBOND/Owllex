"use client"

import { useState } from "react"
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Info,
  Maximize2,
  Minus,
  Plus,
  RotateCw,
  Upload,
} from "lucide-react"
import {
  aiInsightsSummary,
  fixSuggestions,
  mockIssues,
  severityStyles,
  type ContractFileMeta,
  type ContractIssue,
} from "../data"

interface ContractDocumentPanelProps {
  fileMeta: ContractFileMeta
  isAnalyzing: boolean
  selectedIssueId: string | null
  onSelectIssue: (id: string) => void
  activeTab: "document" | "insights"
  onTabChange: (tab: "document" | "insights") => void
  onReupload: () => void
  onRerun: () => void
  fixedIssueIds: Set<string>
}

function HighlightedClause({
  issue,
  children,
  selectedIssueId,
  onSelectIssue,
}: {
  issue: ContractIssue
  children: React.ReactNode
  selectedIssueId: string | null
  onSelectIssue: (id: string) => void
}) {
  const style = severityStyles[issue.severity]
  const isSelected = selectedIssueId === issue.id

  return (
    <span
      onClick={() => onSelectIssue(issue.id)}
      className={`relative cursor-pointer rounded px-0.5 transition-shadow ${style.highlightBg} ${
        isSelected ? `ring-2 ${style.ringColor}` : ""
      }`}
    >
      {children}
      <sup
        className={`ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold text-white align-super ${style.dot}`}
      >
        {issue.badge}
      </sup>
    </span>
  )
}

function DocumentSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-5 w-1/2 mx-auto rounded bg-gray-200 dark:bg-secondary" />
      <div className="h-3 w-full rounded bg-gray-100 dark:bg-secondary/60" />
      <div className="h-3 w-5/6 rounded bg-gray-100 dark:bg-secondary/60" />
      <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-secondary mt-6" />
      <div className="h-3 w-full rounded bg-gray-100 dark:bg-secondary/60" />
      <div className="h-3 w-4/5 rounded bg-gray-100 dark:bg-secondary/60" />
      <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-secondary mt-6" />
      <div className="h-3 w-full rounded bg-gray-100 dark:bg-secondary/60" />
      <div className="h-3 w-2/3 rounded bg-gray-100 dark:bg-secondary/60" />
    </div>
  )
}

function ClauseSlot({
  issue,
  children,
  selectedIssueId,
  onSelectIssue,
  fixedIssueIds,
}: {
  issue: ContractIssue
  children: React.ReactNode
  selectedIssueId: string | null
  onSelectIssue: (id: string) => void
  fixedIssueIds: Set<string>
}) {
  const suggestion = fixSuggestions[issue.id]
  const isFixed = fixedIssueIds.has(issue.id) && suggestion

  if (isFixed) {
    return (
      <span className="relative rounded px-0.5 bg-emerald-50 dark:bg-emerald-500/10">
        {suggestion.fixedText}
        <CheckCircle2 className="inline-block w-3.5 h-3.5 text-emerald-500 ml-1 align-text-bottom" />
      </span>
    )
  }

  return (
    <HighlightedClause issue={issue} selectedIssueId={selectedIssueId} onSelectIssue={onSelectIssue}>
      {children}
    </HighlightedClause>
  )
}

function ServiceAgreementDocument({
  selectedIssueId,
  onSelectIssue,
  fixedIssueIds,
}: {
  selectedIssueId: string | null
  onSelectIssue: (id: string) => void
  fixedIssueIds: Set<string>
}) {
  const clause = (index: number, children: React.ReactNode) => (
    <ClauseSlot
      issue={mockIssues[index]}
      selectedIssueId={selectedIssueId}
      onSelectIssue={onSelectIssue}
      fixedIssueIds={fixedIssueIds}
    >
      {children}
    </ClauseSlot>
  )

  return (
    <div className="draft-doc-editor font-serif text-[13.5px] leading-relaxed text-gray-800 dark:text-foreground/90">
      <h1>SERVICE AGREEMENT</h1>
      <p>
        This Service Agreement (&ldquo;Agreement&rdquo;) is made and entered into on this ___ day of
        ____________, 20___, by and between:
      </p>
      <h3>1. SERVICES</h3>
      <p>The Consultant agrees to provide the services described in {clause(0, "Exhibit A")}.</p>
      <h3>2. PAYMENT TERMS</h3>
      <p>The Client shall pay the Consultant a total fee of $__________.</p>
      <p>{clause(1, "Payment shall be made within 60 days of invoice.")}</p>
      <h3>3. TERM AND TERMINATION</h3>
      <p>This Agreement shall commence on the Effective Date and shall continue for a period of 12 months.</p>
      <p>Either {clause(2, "party may terminate this Agreement upon written notice")}.</p>
      <h3>4. LIMITATION OF LIABILITY</h3>
      <p>
        {clause(
          3,
          "Neither party shall be liable for any indirect, incidental, or consequential damages arising out of or related to this Agreement.",
        )}
      </p>
      <h3>5. GOVERNING LAW</h3>
      <p>{clause(4, "This Agreement shall be governed by the laws of the State of California.")}</p>
    </div>
  )
}

const legendItems: Array<{ key: string; label: string; dotClassName: string }> = [
  { key: "critical", label: "Issues", dotClassName: severityStyles.critical.dot },
  { key: "warning", label: "Warnings", dotClassName: severityStyles.warning.dot },
  { key: "suggestion", label: "Suggestions", dotClassName: severityStyles.suggestion.dot },
  { key: "info", label: "Info", dotClassName: severityStyles.info.dot },
]

export default function ContractDocumentPanel({
  fileMeta,
  isAnalyzing,
  selectedIssueId,
  onSelectIssue,
  activeTab,
  onTabChange,
  onReupload,
  onRerun,
  fixedIssueIds,
}: ContractDocumentPanelProps) {
  const [zoom, setZoom] = useState(100)

  return (
    <div className="flex-1 min-w-0 h-[75vh] xl:h-[calc(100vh-190px)] flex flex-col rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-border shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-500/10 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-red-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-foreground truncate">{fileMeta.name}</p>
            <p className="text-xs text-muted-foreground">
              {fileMeta.uploadedLabel} • {fileMeta.pages} pages
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onReupload}
            className="h-8 px-3 rounded-lg border border-gray-200 dark:border-border flex items-center gap-1.5 text-[12.5px] font-medium text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-secondary transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Re-upload
          </button>
          <button
            type="button"
            onClick={onRerun}
            className="h-8 px-3 rounded-lg bg-gray-900 dark:bg-accent text-white flex items-center gap-1.5 text-[12.5px] font-medium hover:opacity-90 transition-opacity"
          >
            <RotateCw className="w-3.5 h-3.5" />
            Re-run review
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 px-4 pt-2.5 border-b border-gray-200 dark:border-border shrink-0">
        <button
          type="button"
          onClick={() => onTabChange("document")}
          className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "document"
              ? "border-accent text-accent"
              : "border-transparent text-muted-foreground hover:text-gray-700 dark:hover:text-foreground"
          }`}
        >
          Document
        </button>
        <button
          type="button"
          onClick={() => onTabChange("insights")}
          className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "insights"
              ? "border-accent text-accent"
              : "border-transparent text-muted-foreground hover:text-gray-700 dark:hover:text-foreground"
          }`}
        >
          AI insights
        </button>
      </div>

      {activeTab === "document" && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-200 dark:border-border shrink-0 overflow-x-auto custom-scrollbar">
          <div className="flex items-center gap-4 shrink-0">
            {legendItems.map((item) => (
              <span key={item.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`w-2 h-2 rounded-full ${item.dotClassName}`} />
                {item.label}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              title="Zoom out"
              onClick={() => setZoom((z) => Math.max(50, z - 10))}
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-10 text-center text-xs text-muted-foreground">{zoom}%</span>
            <button
              type="button"
              title="Zoom in"
              onClick={() => setZoom((z) => Math.min(150, z + 10))}
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-gray-200 dark:bg-border mx-1" />
            <button
              type="button"
              title="Download document"
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Fullscreen"
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {activeTab === "document" ? (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-[#F8F9FB] dark:bg-background/40 px-4 py-8">
          <div
            className="mx-auto max-w-[720px] origin-top bg-white dark:bg-card shadow-sm border border-gray-200 dark:border-border px-10 py-12"
            style={{ zoom: `${zoom}%` }}
          >
            {isAnalyzing ? (
              <DocumentSkeleton />
            ) : (
              <ServiceAgreementDocument
                selectedIssueId={selectedIssueId}
                onSelectIssue={onSelectIssue}
                fixedIssueIds={fixedIssueIds}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 py-6">
          {isAnalyzing ? (
            <DocumentSkeleton />
          ) : (
            <div className="max-w-[640px] mx-auto space-y-5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-foreground">Overall risk</span>
                <span className="inline-flex items-center rounded-full border border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[11px] font-medium px-2 py-0.5">
                  {aiInsightsSummary.riskLevel}
                </span>
              </div>
              <p className="text-[13.5px] leading-relaxed text-gray-700 dark:text-muted-foreground">
                {aiInsightsSummary.summary}
              </p>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-foreground mb-2.5">Key recommendations</p>
                <ul className="space-y-2.5">
                  {aiInsightsSummary.recommendations.map((rec) => (
                    <li key={rec} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-gray-700 dark:text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between px-5 py-2 border-t border-gray-200 dark:border-border text-[12px] text-muted-foreground shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled
            className="w-6 h-6 rounded flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span>
            Page 1 of {fileMeta.pages}
          </span>
          <button
            type="button"
            disabled
            className="w-6 h-6 rounded flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="flex items-center gap-1">
          <Info className="w-3 h-3" />
          AI review may not be 100% accurate. Please review important clauses.
        </p>
      </div>
    </div>
  )
}
