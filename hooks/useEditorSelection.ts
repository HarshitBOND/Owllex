"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Editor } from "@tiptap/react"
import type { RevisionSelection } from "@/hooks/useRevisions"

/**
 * The editor's current text selection, for scoping a revision to one passage.
 *
 * `attach` is handed to a panel's `onEditorReady`. The selection deliberately
 * survives the editor losing focus: clicking into the revision input blurs the
 * editor, and clearing on blur would mean the scope vanished at the exact
 * moment you went to type the instruction for it.
 */
export function getEditorSelection(editor: Editor): RevisionSelection | null {
  const { from, to } = editor.state.selection
  if (from === to) return null

  // A blank line between blocks, not a single space: it's the one signal the
  // model gets that the passage crossed a paragraph break, and spliceSelection
  // looks for the same blank line in the answer to splice it back across the
  // original paragraphs rather than merging them into one.
  const text = editor.state.doc.textBetween(from, to, "\n\n").trim()
  if (!text) return null

  return { from, to, text }
}

/** How long a keyboard selection must sit still before it counts as finished. */
const SETTLE_MS = 250

export function useEditorSelection() {
  const [selection, setSelection] = useState<RevisionSelection | null>(null)
  const detachRef = useRef<(() => void) | null>(null)

  /**
   * Only a *finished* selection is published.
   *
   * ProseMirror fires selectionUpdate on every mouse move of a drag, and
   * anything that reacts to those -- an instruction box that opens and takes
   * focus -- kills the drag a few characters in, so the passage can never be
   * covered. So: nothing is reported while the mouse is down, the real
   * selection is published on mouseup, and keyboard selection is published once
   * it stops changing.
   */
  const attach = useCallback((editor: Editor) => {
    detachRef.current?.()

    let dragging = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const clearTimer = () => {
      if (timer) clearTimeout(timer)
      timer = null
    }

    const publish = () => {
      clearTimer()
      setSelection(getEditorSelection(editor))
    }

    const onMouseDown = () => {
      dragging = true
      clearTimer()
      // An empty selection from a plain click clears the scope; that is the
      // only way back to revising the whole document.
      setSelection(null)
    }

    // The pointer is regularly released outside the editor -- past the end of
    // the text, or over the box itself -- so the release is watched document-wide.
    const onMouseUp = () => {
      if (!dragging) return
      dragging = false
      // A frame late: ProseMirror maps the final selection on this same event.
      requestAnimationFrame(publish)
    }

    const onSelectionUpdate = () => {
      if (dragging) return
      clearTimer()
      timer = setTimeout(publish, SETTLE_MS)
    }

    editor.view.dom.addEventListener("mousedown", onMouseDown)
    document.addEventListener("mouseup", onMouseUp)
    editor.on("selectionUpdate", onSelectionUpdate)
    publish()

    detachRef.current = () => {
      clearTimer()
      editor.view.dom.removeEventListener("mousedown", onMouseDown)
      document.removeEventListener("mouseup", onMouseUp)
      editor.off("selectionUpdate", onSelectionUpdate)
    }
  }, [])

  useEffect(() => () => detachRef.current?.(), [])

  const clear = useCallback(() => setSelection(null), [])

  return { selection, attach, clear }
}
