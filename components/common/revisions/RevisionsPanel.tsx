"use client"

import { useState } from "react"
import { FileText, Loader2, MoreHorizontal, Plus, RotateCcw, X } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Revision, RevisionSelection } from "@/hooks/useRevisions"

export interface RevisionSource {
  label: string
  sublabel?: string
  onClick?: () => void
}

interface RevisionsPanelProps {
  revisions: Revision[]
  pendingInstruction: string | null
  error?: string | null
  onAddRevision: (instruction: string) => void
  onCancel: () => void
  onRevert: (revisionId: string) => void
  showEdits: boolean
  onShowEditsChange: (next: boolean) => void
  /** Live editor selection, if any -- scopes the next instruction to it. */
  selection?: RevisionSelection | null
  sources?: RevisionSource[]
  disabled?: boolean
}

/**
 * The "..." actions menu for one revision row.
 *
 * Every row mounting its own Radix DropdownMenu up front -- as CitationChip's
 * Popover once did for citation markers -- fires each one's anchor-position
 * effect in the same commit, which can trip React's nested-update-depth check
 * on a document with enough revisions. Deferring the menu to the first
 * hover/focus, the same fix used there, keeps only the row actually in use
 * live.
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
  /** True while reverting is blocked for a reason that has nothing to do with this row -- a pending approval. */
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
      className="shrink-0 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-gray-100 dark:hover:bg-accent/10 cursor-pointer"
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
        <DropdownMenuItem disabled={!restorable} onSelect={(event) => { event.preventDefault(); if (restorable) onRevert() }}>
          <RotateCcw className="w-3.5 h-3.5" />
          {!hasSnapshot ? "Too old to revert" : blocked ? "Approve or reject the pending change first" : "Revert to here"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function RevisionsPanel({
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
}: RevisionsPanelProps) {
  const [composing, setComposing] = useState(false)
  const [instruction, setInstruction] = useState("")
  const [confirmingRevert, setConfirmingRevert] = useState<string | null>(null)

  const submit = () => {
    const trimmed = instruction.trim()
    if (!trimmed) return
    onAddRevision(trimmed)
    setInstruction("")
    setComposing(false)
  }

  return (
    <div className="w-full h-full flex flex-col overflow-y-auto custom-scrollbar">
      <div className="px-4 py-4 border-b border-gray-200 dark:border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Revisions</h2>
          {revisions.length > 0 && (
            <span className="rounded-full bg-gray-100 dark:bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {revisions.length}
            </span>
          )}
        </div>

        {/* A single hairline behind the markers turns the list into a timeline,
            which is what a chain of revisions actually is. */}
        <ol className="relative mt-3 space-y-0.5 before:absolute before:left-[0.72rem] before:top-3 before:bottom-3 before:w-px before:bg-gray-200 before:content-[''] dark:before:bg-border">
          <li className="relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12.5px] text-gray-600 dark:text-muted-foreground">
            <span className="z-10 w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-border shrink-0 ring-4 ring-white dark:ring-card" />
            Initial draft
          </li>

          {revisions.map((revision) => {
            return (
              <li
                key={revision.id}
                className="group relative flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-accent/5"
              >
                <span
                  className={`z-10 mt-[0.4rem] w-1.5 h-1.5 rounded-full shrink-0 ring-4 ring-white dark:ring-card group-hover:ring-gray-50 dark:group-hover:ring-card ${
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
                  // Reverting throws away later revisions, so it gets a
                  // confirmation step rather than firing off a menu click.
                  onRevert={() => setConfirmingRevert(revision.id)}
                />
              </li>
            )
          })}

          {pendingInstruction !== null && (
            <li className="relative flex items-start gap-2 rounded-lg px-1.5 py-1.5 bg-accent/5">
              <Loader2 className="z-10 mt-0.5 w-3.5 h-3.5 shrink-0 animate-spin text-accent" />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] leading-snug text-gray-900 dark:text-foreground">Generating revision</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground break-words">
                  {pendingInstruction}
                </p>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-gray-100 dark:hover:bg-accent/10 cursor-pointer"
                aria-label="Cancel this revision"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          )}
        </ol>

        {confirmingRevert && (
          <div className="mt-2 rounded-lg border border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10 px-3 py-2.5">
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
          <p className="mt-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-[12px] leading-snug text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        {selection?.text ? (
          <p className="mt-3 rounded-lg bg-gray-50 dark:bg-accent/5 px-2.5 py-1.5 text-[11.5px] text-muted-foreground">
            Editing selection:{" "}
            <span className="text-gray-700 dark:text-foreground">
              “{(() => {
                const flat = selection.text.replace(/\s+/g, " ").trim()
                return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat
              })()}”
            </span>
          </p>
        ) : null}

        {composing ? (
          <div className="mt-3">
            <input
              autoFocus
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit()
                if (event.key === "Escape") {
                  setComposing(false)
                  setInstruction("")
                }
              }}
              placeholder="Make the indemnity clause mutual"
              className="w-full rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-background px-3 py-2 text-[12.5px] text-gray-900 dark:text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={!instruction.trim()}
                className="rounded-md bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Generate
              </button>
              <button
                type="button"
                onClick={() => {
                  setComposing(false)
                  setInstruction("")
                }}
                className="rounded-md px-2.5 py-1 text-[11.5px] text-muted-foreground hover:bg-gray-100 dark:hover:bg-accent/10 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setComposing(true)}
            disabled={disabled || pendingInstruction !== null}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 dark:border-border px-3 py-2.5 text-[12.5px] font-medium text-muted-foreground hover:border-accent hover:text-accent hover:bg-accent/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add revision
          </button>
        )}

        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          Tip: select text in the document to scope a revision to that section.
        </p>
      </div>

      <div className="flex items-start justify-between gap-3 px-4 py-3.5 border-b border-gray-200 dark:border-border">
        <div className="min-w-0">
          <label htmlFor="show-edits" className="text-[12.5px] font-medium text-gray-900 dark:text-foreground cursor-pointer">
            Show edits
          </label>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            <span className="text-red-600 dark:text-red-400 line-through">Removed</span> and{" "}
            <span className="text-blue-600 dark:text-blue-400 underline decoration-blue-400/50">added</span> text, marked
            in place.
          </p>
        </div>
        <Switch id="show-edits" checked={showEdits} onCheckedChange={onShowEditsChange} disabled={revisions.length === 0} />
      </div>

      {sources.length > 0 && (
        <div className="px-4 py-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Sources</h3>
          <ul className="mt-2 space-y-1">
            {sources.map((source) => (
              <li key={`${source.label}-${source.sublabel ?? ""}`}>
                <button
                  type="button"
                  onClick={source.onClick}
                  disabled={!source.onClick}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-accent/5 disabled:cursor-default cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-gray-900 dark:text-foreground">
                      {source.label}
                    </span>
                    {source.sublabel && (
                      <span className="block truncate text-[11px] text-muted-foreground">{source.sublabel}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
