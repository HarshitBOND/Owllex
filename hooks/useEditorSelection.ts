"use client"

import { useCallback, useState } from "react"
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

  const text = editor.state.doc.textBetween(from, to, " ").trim()
  if (!text) return null

  return { from, to, text }
}

export function useEditorSelection() {
  const [selection, setSelection] = useState<RevisionSelection | null>(null)

  const attach = useCallback((editor: Editor) => {
    const update = () => {
      const next = getEditorSelection(editor)
      // An empty selection from a plain caret click clears the scope; that is
      // the only way back to revising the whole document.
      setSelection(next)
    }
    editor.on("selectionUpdate", update)
    update()
  }, [])

  const clear = useCallback(() => setSelection(null), [])

  return { selection, attach, clear }
}
