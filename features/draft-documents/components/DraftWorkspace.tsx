"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import type { Editor } from "@tiptap/react"
import type { UIMessage } from "ai"
import { AlertTriangle, FileQuestion } from "lucide-react"
import DocumentEditorPanel from "./DocumentEditorPanel"
import AiAssistantPanel from "./AiAssistantPanel"
import TemplateVersionBanner from "./TemplateVersionBanner"
import { useDraftAutosave } from "../hooks/useDraftAutosave"

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
      const words = editorRef.current?.storage.characterCount.words() ?? 0
      queue({ contentHtml: html, wordCount: words })
    },
    [queue]
  )

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
          onContentChange={(html, words) => queue({ contentHtml: html, wordCount: words })}
          onEditorReady={(editor) => {
            editorRef.current = editor
          }}
          beforeExport={flush}
          templateId={templateInfo?.id ?? null}
          templateVersion={templateInfo?.pinnedVersion}
          hasSourcePdf={templateInfo?.hasSourcePdf}
          assistantOpen={assistantOpen}
          onOpenAssistant={() => setAssistantOpen(true)}
        />

        {assistantOpen && (
          <AiAssistantPanel
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
          />
        )}
      </div>
    </div>
  )
}
