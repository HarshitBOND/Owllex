"use client"

interface RedlineViewProps {
  html: string
  className?: string
  style?: React.CSSProperties
}

/**
 * Read-only tracked-changes view, shown in place of the editor while
 * "Show edits" is on.
 *
 * Deliberately not a ProseMirror decoration layer: a deletion is text that is
 * not in the document, so showing it means injecting DOM the editor does not
 * own -- into a live editor with a 1200ms autosave debounce running underneath.
 * Getting that wrong corrupts a saved contract. Swapping the editor out for
 * plain markup cannot.
 */
export default function RedlineView({ html, className = "", style }: RedlineViewProps) {
  return (
    <div
      className={`redline-view max-w-none ${className}`}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
