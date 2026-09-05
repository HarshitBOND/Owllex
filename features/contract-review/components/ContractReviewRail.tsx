"use client"

import { useState } from "react"
import ContractInsightsPanel from "./ContractInsightsPanel"
import RevisionsPanel, { type RevisionSource } from "@/components/common/revisions/RevisionsPanel"
import type { ContractIssue, ContractSummary } from "../data"
import type { Revision, RevisionSelection } from "@/hooks/useRevisions"

type RailTab = "issues" | "revisions"

interface ContractReviewRailProps {
  // Issues tab -- passed straight through to the existing panel.
  isAnalyzing: boolean
  analyzeError?: string | null
  issues: ContractIssue[]
  summary: ContractSummary | null
  selectedIssueId: string | null
  onSelectIssue: (id: string) => void
  resolvedIssueIds: Set<string>
  onToggleResolved: (id: string) => void
  onOpenChat: () => void

  // Revisions tab.
  revisions: Revision[]
  pendingInstruction: string | null
  revisionError?: string | null
  onAddRevision: (instruction: string) => void
  onCancelRevision: () => void
  onRevert: (revisionId: string) => void
  showEdits: boolean
  onShowEditsChange: (next: boolean) => void
  selection?: RevisionSelection | null
  sources?: RevisionSource[]
}

export default function ContractReviewRail(props: ContractReviewRailProps) {
  const [tab, setTab] = useState<RailTab>("issues")

  const revisionCount = props.revisions.length

  return (
    <div className="w-full h-full flex flex-col rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden">
      {/*
        A segmented control rather than the underline style the Issues panel
        uses for its own severity filters -- two identical tab strips stacked on
        top of each other read as one broken control.
      */}
      <div className="shrink-0 p-2 border-b border-gray-200 dark:border-border">
        <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-accent/5 p-0.5">
          {(
            [
              { key: "issues" as const, label: "Issues", count: props.issues.length },
              { key: "revisions" as const, label: "Revisions", count: revisionCount },
            ]
          ).map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              aria-selected={tab === entry.key}
              role="tab"
              className={`flex-1 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer ${
                tab === entry.key
                  ? "bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-gray-900 dark:hover:text-foreground"
              }`}
            >
              {entry.label}
              {entry.count > 0 && <span className="ml-1.5 text-[11px] text-muted-foreground">{entry.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {tab === "issues" ? (
          <ContractInsightsPanel
            isAnalyzing={props.isAnalyzing}
            error={props.analyzeError}
            issues={props.issues}
            summary={props.summary}
            selectedIssueId={props.selectedIssueId}
            onSelectIssue={props.onSelectIssue}
            resolvedIssueIds={props.resolvedIssueIds}
            onToggleResolved={props.onToggleResolved}
            onOpenChat={props.onOpenChat}
          />
        ) : (
          <RevisionsPanel
            revisions={props.revisions}
            pendingInstruction={props.pendingInstruction}
            error={props.revisionError}
            onAddRevision={props.onAddRevision}
            onCancel={props.onCancelRevision}
            onRevert={props.onRevert}
            showEdits={props.showEdits}
            onShowEditsChange={props.onShowEditsChange}
            selection={props.selection}
            sources={props.sources}
            disabled={props.isAnalyzing}
          />
        )}
      </div>
    </div>
  )
}
