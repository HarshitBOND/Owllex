"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { Editor } from "@tiptap/react"
import { Check, Loader2, X } from "lucide-react"
import type { RevisionSelection } from "@/hooks/useRevisions"

interface InlineEditComposerProps {
  editor: Editor | null
  /** The scroll container it positions itself inside; must be `relative`. */
  containerRef: React.RefObject<HTMLElement | null>
  /** The column the document text occupies, so the box lines up with the prose. */
  columnRef: React.RefObject<HTMLElement | null>
  selection: RevisionSelection | null
  /**
   * The passage a submitted revision is scoped to, frozen at submit time.
   * Takes over from `selection` the moment an instruction is sent, so the
   * status box keeps pointing at the right passage even if focus moves or the
   * live selection changes while the model is still writing.
   */
  activeScope: RevisionSelection | null
  busy?: boolean
  approvalInstruction?: string | null
  onSubmit: (instruction: string) => void
  onApprove?: () => void
  onReject?: () => void
}

/**
 * The in-document box for a selection-scoped revision: an instruction input
 * while a passage is picked, then a status box -- generating, then
 * approve/reject -- once it's submitted.
 *
 * It sits in the flow of the page rather than in a popover: the thing being
 * changed is the text right above it, and a floating card over that text hides
 * the very words you are describing. The selected passage stays lit underneath
 * (selectionPinExtension) for as long as this is open -- pulsing while the
 * model writes, steady once there's an answer to review.
 */
export default function InlineEditComposer({
  editor,
  containerRef,
  columnRef,
  selection,
  activeScope,
  busy = false,
  approvalInstruction = null,
  onSubmit,
  onApprove,
  onReject,
}: InlineEditComposerProps) {
  const [instruction, setInstruction] = useState("")
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Which passage the open box belongs to, so a fresh selection reopens it
  // rather than silently retargeting a half-written instruction.
  const anchoredTo = useRef<string | null>(null)
  const prevActiveScope = useRef<RevisionSelection | null>(null)

  const target = activeScope ?? selection

  const place = useCallback(() => {
    const container = containerRef.current
    const column = columnRef.current
    if (!editor || !container || !column || !target) {
      setBox(null)
      return
    }

    let bottom: number
    try {
      const start = editor.view.coordsAtPos(target.from)
      const end = editor.view.coordsAtPos(target.to)
      bottom = Math.max(start.bottom, end.bottom)
    } catch {
      // The position can outrun the document mid-stream; the next update places it.
      return
    }

    const containerBox = container.getBoundingClientRect()
    const columnBox = column.getBoundingClientRect()
    setBox({
      top: bottom - containerBox.top + container.scrollTop + 12,
      left: columnBox.left - containerBox.left,
      width: columnBox.width,
    })
  }, [containerRef, columnRef, editor, target])

  useLayoutEffect(() => {
    place()
  }, [place])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onMove = () => place()
    container.addEventListener("scroll", onMove, { passive: true })
    window.addEventListener("resize", onMove)
    return () => {
      container.removeEventListener("scroll", onMove)
      window.removeEventListener("resize", onMove)
    }
  }, [containerRef, place])

  // Pins the passage and resets the instruction box for a freshly picked
  // selection. Only reacts to the live selection -- once a revision is
  // submitted, activeScope owns the pin and this must leave it alone.
  useEffect(() => {
    if (activeScope) return
    const key = selection ? `${selection.from}:${selection.to}` : null
    if (key === anchoredTo.current) return
    anchoredTo.current = key
    setInstruction("")
    setDismissed(false)

    if (!editor) return
    if (selection) {
      editor.commands.pinSelection({ from: selection.from, to: selection.to })
      // Focus once the box exists, so the caret lands in it and not in the text.
      requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
    } else {
      editor.commands.clearPinnedSelection()
    }
  }, [selection, activeScope, editor])

  // While a revision is in flight or awaiting approval, the pin stays lit at
  // the frozen scope -- pulsing during generation, steady once there's an
  // answer to review.
  useEffect(() => {
    if (!editor || !activeScope) return
    editor.commands.pinSelection({ from: activeScope.from, to: activeScope.to, revising: busy })
  }, [editor, activeScope, busy])

  // The moment a revision resolves (approved, rejected or cancelled),
  // activeScope drops back to null -- clear the stale pin rather than leaving
  // it lit over text the document may no longer even have at those positions.
  useEffect(() => {
    if (prevActiveScope.current && !activeScope) {
      editor?.commands.clearPinnedSelection()
      anchoredTo.current = null
    }
    prevActiveScope.current = activeScope
  }, [activeScope, editor])

  const dismiss = () => {
    setDismissed(true)
    setInstruction("")
    editor?.commands.clearPinnedSelection()
    editor?.commands.focus()
  }

  const submit = () => {
    const trimmed = instruction.trim()
    if (!trimmed || busy) return
    onSubmit(trimmed)
    setInstruction("")
  }

  if (!editor || !target || !box) return null

  if (activeScope) {
    return (
      <div style={{ top: box.top, left: box.left, width: box.width }} className="absolute z-30">
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card shadow-[0_10px_30px_-14px_rgba(15,23,42,0.4)] px-3.5 py-2.5">
          {busy ? (
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
                {approvalInstruction ? (
                  <span className="text-gray-500 dark:text-muted-foreground"> — {approvalInstruction}</span>
                ) : null}
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
      </div>
    )
  }

  if (dismissed) return null

  return (
    <div style={{ top: box.top, left: box.left, width: box.width }} className="absolute z-30">
      <div
        className="rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card shadow-[0_10px_30px_-14px_rgba(15,23,42,0.4)] px-3.5 py-3"
        onMouseDown={(event) => {
          // Clicking the box must not collapse the selection it acts on -- but
          // the input is exempt, or it could never take focus.
          const target = event.target as HTMLElement | null
          if (target?.closest("input")) return
          event.preventDefault()
        }}
      >
        <input
          ref={inputRef}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              submit()
            }
            if (event.key === "Escape") dismiss()
          }}
          placeholder="Describe how to change the selected text"
          className="w-full bg-transparent text-[13px] leading-6 text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted-foreground focus:outline-none"
        />

        <div className="mt-2.5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-gray-500 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!instruction.trim() || busy}
            className="flex items-center gap-1.5 rounded-md bg-[#0F1B2A] dark:bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity cursor-pointer"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Add edits
          </button>
        </div>
      </div>
    </div>
  )
}
