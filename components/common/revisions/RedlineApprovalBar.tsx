"use client"

import { Check, Loader2, X } from "lucide-react"

interface RedlineApprovalBarProps {
  /** True while the revision is still streaming in -- nothing to decide on yet. */
  generating: boolean
  /** The instruction behind the change awaiting approval, once it has arrived. */
  instruction: string | null
  onApprove: () => void
  onReject: () => void
}

/**
 * Sits above the tracked-changes view while a proposed revision has been
 * generated but not yet committed to the document.
 *
 * The redline by itself doesn't say whether a change already happened or is
 * still up for a decision -- useRevisions holds the finished revision back
 * from the editor until Approve is clicked, so this is what turns that state
 * into something to act on, in the document itself rather than a side panel.
 */
export default function RedlineApprovalBar({ generating, instruction, onApprove, onReject }: RedlineApprovalBarProps) {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-gray-200 dark:border-border bg-gray-50 dark:bg-accent/5 px-3.5 py-2.5">
      {generating ? (
        <>
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-accent" />
          <p className="min-w-0 flex-1 truncate text-[12.5px] text-gray-600 dark:text-muted-foreground">
            Writing the revision…
          </p>
        </>
      ) : (
        <>
          <p className="min-w-0 flex-1 truncate text-[12.5px] text-gray-700 dark:text-foreground">
            <span className="font-medium text-gray-900 dark:text-foreground">Proposed change</span>
            {instruction ? <span className="text-gray-500 dark:text-muted-foreground"> — {instruction}</span> : null}
          </p>
          <button
            type="button"
            onClick={onReject}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-gray-600 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            Reject
          </button>
          <button
            type="button"
            onClick={onApprove}
            className="flex items-center gap-1.5 rounded-md bg-[#0F1B2A] dark:bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            Approve
          </button>
        </>
      )}
    </div>
  )
}
