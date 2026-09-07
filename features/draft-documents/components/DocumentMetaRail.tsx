"use client"

import { useState } from "react"
import { FileText, Loader2, MoreHorizontal, Plus, Quote, RotateCcw, X } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Revision, RevisionSelection } from "@/hooks/useRevisions"

export interface DocumentSource {
  label: string
  sublabel?: string
  /** Page numbers to chip out under the file, when the source has any. */
  pages?: number[]
  onClick?: () => void
}

interface DocumentMetaRailProps {
  revisions: Revision[]
  pendingInstruction: string | null
  error?: string | null
  onAddRevision: (instruction: string) => void
  onCancel: () => void
  onRevert: (revisionId: string) => void
  showEdits: boolean
  onShowEditsChange: (next: boolean) => void
  /** Live editor selection -- scopes the next instruction to that passage. */
  selection?: RevisionSelection | null
  sources?: DocumentSource[]
  /** True while a generated revision is awaiting Approve/Reject in the document. */
  disabled?: boolean
  /** True once autosave has hit a version conflict -- nothing typed reaches the server until reload. */
  conflict?: boolean
}

/**
 * The "..." actions menu for one revision row.
 *
 * Mounted only once the row is hovered or focused: every row mounting its own
 * Radix menu up front fires each one's anchor-position effect in the same
 * commit, which can trip React's nested-update-depth check on a document with
 * enough revisions.
 */
function RevisionRowMenu({
  label,
  hasSnapshot,
  blocked,
  onRevert,
}: {
  label: string
  /** Whether this row still carries the document snapshot needed to restore it. */
  hasSnapshot: boolean
  /** True while reverting is blocked for a reason that has nothing to do with this row -- a pending approval or a save conflict. */
  blocked: boolean
  onRevert: () => void
}) {
  const [ready, setReady] = useState(false)
  const activate = () => setReady(true)
  const restorable = hasSnapshot && !blocked

  const trigger = (
    <button
      type="button"
      onMouseEnter={activate}
      onFocus={activate}
      className="shrink-0 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-gray-100 dark:hover:bg-secondary cursor-pointer"
      aria-label={`Actions for revision "${label}"`}
    >
      <MoreHorizontal className="w-3.5 h-3.5" />
    </button>
  )

  if (!ready) return trigger

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={!restorable}
          onSelect={(event) => {
            event.preventDefault()
            if (restorable) onRevert()
          }}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {!hasSnapshot ? "Too old to revert" : blocked ? "Approve or reject the pending change first" : "Revert to here"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[13px] font-semibold text-gray-900 dark:text-foreground">{children}</h2>
}

export default function DocumentMetaRail({
  revisions,
  pendingInstruction,
  error,
  onAddRevision,
  onCancel,
  onRevert,
  showEdits,
  onShowEditsChange,
  selection,
  sources = [],
  disabled = false,
  conflict = false,
}: DocumentMetaRailProps) {
  const [instruction, setInstruction] = useState("")
  const [confirmingRevert, setConfirmingRevert] = useState<string | null>(null)

  const submit = () => {
    const trimmed = instruction.trim()
    if (!trimmed || pendingInstruction !== null || disabled) return
    onAddRevision(trimmed)
    setInstruction("")
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card">
      <div className="px-4 py-4">
        <SectionHeading>Revisions</SectionHeading>

        <ol className="mt-3 space-y-1.5">
          <li className="text-[12.5px] text-gray-500 dark:text-muted-foreground">Initial draft</li>

          {revisions.map((revision) => (
            <li key={revision.id} className="group flex items-start gap-2">
              <span
                className={`mt-[0.42rem] w-1.5 h-1.5 rounded-full shrink-0 ${
                  revision.status === "error" ? "bg-red-400" : "bg-accent"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] leading-snug text-gray-900 dark:text-foreground break-words">
                  {revision.instruction}
                </p>
                {revision.status === "error" && revision.errorMessage && (
                  <p className="mt-0.5 text-[11px] leading-snug text-red-600 dark:text-red-400">
                    {revision.errorMessage}
                  </p>
                )}
                {revision.scope.selectedText && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground truncate">Scoped to a selection</p>
                )}
              </div>
              <RevisionRowMenu
                label={revision.instruction}
                hasSnapshot={Boolean(revision.contentHtmlBefore)}
                blocked={disabled}
                // Reverting discards later revisions, so it asks first.
                onRevert={() => setConfirmingRevert(revision.id)}
              />
            </li>
          ))}

          {pendingInstruction !== null && (
            <li className="flex items-start gap-2 rounded-md bg-gray-50 dark:bg-secondary/40 px-2 py-1.5">
              <Loader2 className="mt-0.5 w-3.5 h-3.5 shrink-0 animate-spin text-accent" />
              <p className="min-w-0 flex-1 text-[12px] leading-snug text-gray-600 dark:text-muted-foreground break-words">
                {pendingInstruction}
              </p>
              <button
                type="button"
                onClick={onCancel}
                aria-label="Cancel this revision"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-gray-200 dark:hover:bg-secondary cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          )}
        </ol>

        {confirmingRevert && (
          <div className="mt-3 rounded-lg border border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10 px-3 py-2.5">
            <p className="text-[12px] leading-snug text-orange-800 dark:text-orange-300">
              This restores the document as it was before that revision and discards every revision after it.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onRevert(confirmingRevert)
                  setConfirmingRevert(null)
                }}
                className="rounded-md bg-orange-600 px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-orange-700 cursor-pointer"
              >
                Revert
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRevert(null)}
                className="rounded-md px-2.5 py-1 text-[11.5px] text-orange-800 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-500/20 cursor-pointer"
              >
                Keep it
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-[12px] leading-snug text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        <input
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit()
            if (event.key === "Escape") setInstruction("")
          }}
          disabled={pendingInstruction !== null || disabled}
          placeholder={
            conflict
              ? "Changed elsewhere -- reload to keep editing"
              : disabled
                ? "Approve or reject the pending change first…"
                : selection?.text
                  ? "Change the selected passage…"
                  : "Turn this into a paragraph"
          }
          className="mt-3 w-full rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-background px-3 py-2 text-[12.5px] text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted-foreground focus:outline-none focus:border-gray-400 dark:focus:border-accent disabled:opacity-50"
        />

        <button
          type="button"
          onClick={submit}
          disabled={!instruction.trim() || pendingInstruction !== null || disabled}
          className="mt-2 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12.5px] font-medium text-gray-600 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add revision
        </button>

        <div className="mt-3 flex gap-2 text-[11.5px] leading-snug text-gray-500 dark:text-muted-foreground">
          <Quote className="w-3 h-3 shrink-0 mt-0.5 rotate-180" />
          <p>You can select text in the draft to make changes to specific sections.</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-gray-200 dark:border-border px-4 py-3.5">
        <label
          htmlFor="show-edits"
          className="text-[13px] font-semibold text-gray-900 dark:text-foreground cursor-pointer"
        >
          Show edits
        </label>
        <Switch
          id="show-edits"
          checked={showEdits}
          onCheckedChange={onShowEditsChange}
          disabled={revisions.length === 0}
        />
      </div>

      {sources.length > 0 && (
        <div className="border-t border-gray-200 dark:border-border px-4 py-4">
          <SectionHeading>Sources</SectionHeading>
          <ul className="mt-2.5 space-y-3">
            {sources.map((source) => (
              <li key={`${source.label}-${source.sublabel ?? ""}`}>
                <button
                  type="button"
                  onClick={source.onClick}
                  disabled={!source.onClick}
                  className="flex w-full items-center gap-1.5 text-left disabled:cursor-default cursor-pointer group"
                >
                  <FileText className="w-3.5 h-3.5 shrink-0 text-gray-400 dark:text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#2563eb] dark:text-accent group-disabled:text-gray-700 dark:group-disabled:text-foreground">
                    {source.label}
                  </span>
                </button>
                {source.sublabel && (
                  <p className="mt-0.5 ml-5 truncate text-[11px] text-muted-foreground">{source.sublabel}</p>
                )}
                {source.pages && source.pages.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {source.pages.map((page) => (
                      <span
                        key={page}
                        className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded bg-gray-100 dark:bg-secondary px-1 text-[10px] text-gray-500 dark:text-muted-foreground"
                      >
                        {page}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
