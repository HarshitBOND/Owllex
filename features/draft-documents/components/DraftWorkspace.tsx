"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import type { Editor } from "@tiptap/react"
import type { UIMessage } from "ai"
import { AlertTriangle, FileQuestion } from "lucide-react"
import DocumentEditorPanel from "./DocumentEditorPanel"
import DraftRail from "./DraftRail"
import TemplateVersionBanner from "./TemplateVersionBanner"
import { useDraftAutosave } from "../hooks/useDraftAutosave"
import { useRevisions, type Revision } from "@/hooks/useRevisions"
import { useEditorSelection } from "@/hooks/useEditorSelection"

type Draft = {
  id: string
  title: string
  contentHtml: string
  seedPrompt: string
  typography: { fontFamily: string; fontSizePt: number }
  version: number
  chatMessages: UIMessage[]
  templateId: string | null
  fieldsVersion: number
  fieldValues: Record<string, unknown>
  fieldProvenance: Record<string, { source: string; documentId?: string; quote?: string }>
  revisions: Revision[]
}

/** Resolved against the snapshot the draft is pinned to, never the latest. */
type TemplateInfo = {
  id: string
  fields: { key: string; label: string; type: string }[]
  pinnedVersion: number
  latestVersion: number
  hasNewerVersion: boolean
  hasSourcePdf: boolean
}

export default function DraftWorkspace({ draftId }: { draftId: string }) {
  const editorRef = useRef<Editor | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [templateInfo, setTemplateInfo] = useState<TemplateInfo | null>(null)
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing">("loading")
  const [title, setTitle] = useState("")
  const [typography, setTypography] = useState({ fontFamily: "Georgia", fontSizePt: 12 })
  const [assistantOpen, setAssistantOpen] = useState(true)
  const [showEdits, setShowEdits] = useState(false)
  const editorSelection = useEditorSelection()
  // Mirrors the editor so the redline has a live base to diff against;
  // draft.contentHtml is only ever the document as first loaded.
  const [contentHtml, setContentHtml] = useState("")

  const { status, conflict, queue, flush, retry } = useDraftAutosave(draftId, draft?.version ?? 0)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/draft-documents/${draftId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        if (!data?.success) {
          setLoadState("missing")
          return
        }
        setDraft(data.draft)
        setContentHtml(data.draft.contentHtml ?? "")
        setTemplateInfo(data.template ?? null)
        setTitle(data.draft.title)
        setTypography(data.draft.typography ?? { fontFamily: "Georgia", fontSizePt: 12 })
        setLoadState("ready")
      })
      .catch(() => !cancelled && setLoadState("missing"))
    return () => {
      cancelled = true
    }
  }, [draftId])

  /**
   * Accepts values the assistant proposed for a court form.
   *
   * The document is re-rendered server-side from the field values rather than
   * written as HTML here, so the court's prescribed wording and layout stay
   * exactly as issued. `force` is set because the advocate has just explicitly
   * accepted the change.
   */
  const applyFields = useCallback(
    async (values: { key: string; value: string }[]) => {
      if (!draft) return

      const next: Record<string, unknown> = { ...(draft.fieldValues ?? {}) }
      for (const { key, value } of values) {
        const field = templateInfo?.fields.find((f) => f.key === key)
        if (field?.type === "table") {
          // Table values arrive as JSON from the model; a malformed one is
          // dropped rather than written as a string the renderer cannot use.
          try {
            const parsed = JSON.parse(value)
            if (Array.isArray(parsed)) next[key] = parsed
          } catch {
            continue
          }
          continue
        }
        next[key] = value
      }

      const res = await fetch(`/api/draft-documents/${draftId}/fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldValues: next, force: true }),
      })
      const data = await res.json()
      if (!data.success) return

      editorRef.current?.commands.setContent(data.contentHtml)
      setDraft((prev) => (prev ? { ...prev, fieldValues: next } : prev))
    },
    [draft, draftId, templateInfo]
  )

  const applyProposal = useCallback(
    (html: string) => {
      editorRef.current?.commands.setContent(html)
      setContentHtml(html)
      const words = editorRef.current?.storage.characterCount.words() ?? 0
      queue({ contentHtml: html, wordCount: words })
    },
    [queue]
  )

  /**
   * Puts a finished revision into the editor.
   *
   * No autosave queue here, unlike applyProposal: the revise route already
   * wrote contentHtml and bumped version server-side, so a PATCH of the same
   * text would only race its own write.
   */
  const applyRevision = useCallback((html: string, nextRevisions: Revision[]) => {
    editorRef.current?.commands.setContent(html)
    setContentHtml(html)
    setDraft((prev) => (prev ? { ...prev, version: prev.version + 1 } : prev))
    setShowEdits(nextRevisions.length > 0)
  }, [])

  const revisionsApi = useRevisions(draftId, "/api/draft-documents", {
    currentHtml: contentHtml,
    onApplied: applyRevision,
  })

  const { setRevisions } = revisionsApi
  // Seeded from the loaded draft rather than inside the fetch itself, which
  // would reference the hook above before it exists.
  useEffect(() => {
    if (draft) setRevisions(draft.revisions ?? [])
  }, [draft, setRevisions])

  /**
   * Sources card contents, from the provenance the drafting flow already
   * records per field.
   *
   * A draft has no uploaded PDF to cite pages of, but it does know which case
   * and which corpus documents its facts came from -- which is the thing worth
   * showing. Values the advocate typed are omitted: "user" is not a source.
   */
  const draftSources = useMemo(() => {
    if (!draft) return []
    const labels = templateInfo
      ? Object.fromEntries(templateInfo.fields.map((field) => [field.key, field.label]))
      : {}

    const seen = new Map<string, { label: string; sublabel?: string }>()
    for (const [key, entry] of Object.entries(draft.fieldProvenance ?? {})) {
      if (!entry || entry.source === "user") continue
      const label =
        entry.source === "case"
          ? "Linked case"
          : entry.source === "corpusDoc"
            ? (entry.documentId ?? "Corpus document")
            : entry.source === "corpusFact"
              ? "Corpus"
              : "AI-filled"
      const fieldLabel = labels[key] ?? key
      const existing = seen.get(label)
      seen.set(label, {
        label,
        sublabel: existing?.sublabel ? `${existing.sublabel}, ${fieldLabel}` : fieldLabel,
      })
    }
    return [...seen.values()]
  }, [draft, templateInfo])

  if (loadState === "loading") {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (loadState === "missing" || !draft) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="max-w-sm text-center rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-8">
          <FileQuestion className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto" />
          <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-foreground">Document not found</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">
            It may have been deleted, or it belongs to another account.
          </p>
          <Link
            href="/draft-documents"
            className="mt-4 inline-flex items-center text-xs font-medium text-white bg-accent rounded-lg px-3 py-2 hover:opacity-90 transition-opacity"
          >
            Back to documents
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-2 relative">
      {conflict && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 shadow-lg px-4 py-2.5 flex flex-wrap items-center gap-3">
          <p className="text-[12.5px] text-amber-800 dark:text-amber-300 flex items-center gap-1.5 flex-1 min-w-[240px]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            This draft was changed in another tab or window. Reload to get the latest version your unsaved
            changes here will be lost.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(editorRef.current?.getHTML() ?? "").catch(() => {})
              }}
              className="h-7 px-3 rounded-lg border border-amber-300 dark:border-amber-500/30 text-[12px] font-medium text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
            >
              Copy my version
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-7 px-3 rounded-lg bg-amber-600 text-white text-[12px] font-medium hover:bg-amber-700 transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      )}

      {templateInfo?.hasNewerVersion && (
        <TemplateVersionBanner
          draftId={draftId}
          pinnedVersion={templateInfo.pinnedVersion}
          latestVersion={templateInfo.latestVersion}
        />
      )}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 md:gap-4">
        <DocumentEditorPanel
          draftId={draftId}
          initialContent={draft.contentHtml}
          title={title}
          onTitleChange={(next) => {
            setTitle(next)
            queue({ title: next.trim() || "Untitled document" })
          }}
          typography={typography}
          onTypographyChange={(next) => {
            setTypography(next)
            queue({ typography: next })
          }}
          saveStatus={status}
          onRetrySave={retry}
          onContentChange={(html, words) => {
            setContentHtml(html)
            queue({ contentHtml: html, wordCount: words })
          }}
          onEditorReady={(editor) => {
            editorRef.current = editor
            editorSelection.attach(editor)
          }}
          beforeExport={flush}
          templateId={templateInfo?.id ?? null}
          templateVersion={templateInfo?.pinnedVersion}
          hasSourcePdf={templateInfo?.hasSourcePdf}
          assistantOpen={assistantOpen}
          onOpenAssistant={() => setAssistantOpen(true)}
          showEdits={showEdits}
          redlineHtml={revisionsApi.redlineHtml}
        />

        {assistantOpen && (
          <DraftRail
            draftId={draftId}
            initialMessages={draft.chatMessages ?? []}
            seedPrompt={draft.seedPrompt}
            getDocumentHtml={() => editorRef.current?.getHTML() ?? ""}
            onApply={applyProposal}
            onApplyFields={templateInfo?.fields.length ? applyFields : undefined}
            fieldLabels={
              templateInfo
                ? Object.fromEntries(templateInfo.fields.map((f) => [f.key, f.label]))
                : undefined
            }
            onClose={() => setAssistantOpen(false)}
            revisions={revisionsApi.revisions}
            pendingInstruction={revisionsApi.pendingInstruction}
            revisionError={revisionsApi.error}
            onAddRevision={(instruction) => revisionsApi.addRevision(instruction, editorSelection.selection)}
            onCancelRevision={revisionsApi.cancel}
            onRevert={revisionsApi.revert}
            showEdits={showEdits}
            onShowEditsChange={setShowEdits}
            selection={editorSelection.selection}
            sources={draftSources}
          />
        )}
      </div>
    </div>
  )
}
