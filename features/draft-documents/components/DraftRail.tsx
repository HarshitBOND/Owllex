"use client"

import { useState } from "react"
import type { UIMessage } from "ai"
import AiAssistantPanel from "./AiAssistantPanel"
import RevisionsPanel, { type RevisionSource } from "@/components/common/revisions/RevisionsPanel"
import type { Revision, RevisionSelection } from "@/hooks/useRevisions"

type RailTab = "assistant" | "revisions"

interface DraftRailProps {
  // Assistant tab -- passed straight through to the existing panel.
  draftId: string
  initialMessages: UIMessage[]
  seedPrompt: string
  getDocumentHtml: () => string
  onApply: (html: string) => void
  onApplyFields?: (values: { key: string; value: string }[]) => void
  fieldLabels?: Record<string, string>
  onClose: () => void

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

export default function DraftRail(props: DraftRailProps) {
  const [tab, setTab] = useState<RailTab>("assistant")
  // The assistant's expand control used to size the panel itself; now that the
  // rail is the flex item, the width has to live out here or expanding does
  // nothing.
  const [assistantExpanded, setAssistantExpanded] = useState(false)

  const width =
    tab === "assistant" && assistantExpanded ? "lg:w-[720px]" : "lg:w-[400px] xl:w-[430px]"

  return (
    <div
      className={`w-full shrink-0 h-[70vh] lg:h-full flex flex-col rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden transition-all duration-300 ${width}`}
    >
      {/* Segmented control, matching ContractReviewRail so the two features read the same. */}
      <div className="shrink-0 p-2 border-b border-gray-200 dark:border-border">
        <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-accent/5 p-0.5">
          {(
            [
              { key: "assistant" as const, label: "Assistant", count: 0 },
              { key: "revisions" as const, label: "Revisions", count: props.revisions.length },
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
        {tab === "assistant" ? (
          <AiAssistantPanel
            draftId={props.draftId}
            initialMessages={props.initialMessages}
            seedPrompt={props.seedPrompt}
            getDocumentHtml={props.getDocumentHtml}
            onApply={props.onApply}
            onApplyFields={props.onApplyFields}
            fieldLabels={props.fieldLabels}
            onClose={props.onClose}
            embedded
            expanded={assistantExpanded}
            onExpandedChange={setAssistantExpanded}
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
          />
        )}
      </div>
    </div>
  )
}
