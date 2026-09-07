"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import type { Editor } from "@tiptap/react"
import type { UIMessage } from "ai"
import { AlertTriangle, FileQuestion, X } from "lucide-react"
import DocumentSurface from "./DocumentSurface"
import DocumentMetaRail from "./DocumentMetaRail"
import AiAssistantPanel from "./AiAssistantPanel"
import TemplateVersionBanner from "./TemplateVersionBanner"
import { useDraftAutosave } from "../hooks/useDraftAutosave"
import { useRevisions, type Revision } from "@/hooks/useRevisions"
import { useEditorSelection } from "@/hooks/useEditorSelection"
import { DEFAULT_DRAFT_FONT } from "@/lib/documents/draftFont"

type Draft = {
  id: string
  title: string
  status: "draft" | "final"
  updatedAt: string
  templateTitle: string
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
  const [typography, setTypography] = useState({ fontFamily: DEFAULT_DRAFT_FONT, fontSizePt: 11 })
  // The assistant is a drawer now, not a column: the document and its
  // revisions are the page, and the chat is something you open when you want it.
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [showEdits, setShowEdits] = useState(false)
  const editorSelection = useEditorSelection()
  // Mirrors the editor so the redline has a live base to diff against;
  // draft.contentHtml is only ever the document as first loaded.
  const [contentHtml, setContentHtml] = useState("")
  // Read inside generateTitleOnce, which must see the title as it stands the
  // moment the request resolves -- not as it was when the request was fired.
  const titleRef = useRef(title)
  titleRef.current = title
  const autoTitleAttempted = useRef(false)

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
        setTypography(data.draft.typography ?? { fontFamily: DEFAULT_DRAFT_FONT, fontSizePt: 11 })
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
      // The fields route just bumped the server's version -- adopt it here the
      // same way applyRevision does, or the autosave hook keeps saving against
      // the version this document had *before* the fields write and every
      // save after this one 409s as a spurious conflict.
      setDraft((prev) =>
        prev ? { ...prev, fieldValues: next, contentHtml: data.contentHtml, version: data.version ?? prev.version } : prev
      )
      setContentHtml(data.contentHtml)
    },
    [draft, draftId, templateInfo]
  )

  /**
   * Proposes a heading the first time a freeform draft gets real content.
   *
   * Fires at most once per draft (a template-started draft already opens with
   * the template's own title, which never matches "Untitled document" here,
   * so this quietly does nothing for those). Never overwrites a title the
   * advocate has since typed -- generation and autosave can race, and the
   * advocate's own edit always wins.
   */
  const generateTitleOnce = useCallback(
    (html: string) => {
      if (autoTitleAttempted.current) return
      const current = titleRef.current.trim()
      if (current && current !== "Untitled document") return
      autoTitleAttempted.current = true

      fetch(`/api/draft-documents/${draftId}/generate-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentHtml: html }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.success || !data.title) return
          const stillDefault = titleRef.current.trim() === "" || titleRef.current === "Untitled document"
          if (!stillDefault) return
          setTitle(data.title)
          queue({ title: data.title })
        })
        .catch(() => {
          // A missing heading is a minor inconvenience, not a failure worth surfacing.
        })
    },
    [draftId, queue]
  )

  const applyProposal = useCallback(
    (html: string) => {
      editorRef.current?.commands.setContent(html)
      setContentHtml(html)
      const words = editorRef.current?.storage.characterCount.words() ?? 0
      queue({ contentHtml: html, wordCount: words })
      generateTitleOnce(html)
    },
    [queue, generateTitleOnce]
  )

  /**
   * Puts a finished revision into the editor.
   *
   * No autosave queue here, unlike applyProposal: the revise route already
   * wrote contentHtml and bumped version server-side, so a PATCH of the same
   * text would only race its own write.
   */
  const applyRevision = useCallback((html: string, nextRevisions: Revision[], wasScoped?: boolean, version?: number) => {
    // Cleared before the content swap, not after: the overlay and pin decorate
    // positions in the document as it stood a moment ago, and setContent below
    // replaces the whole thing -- leaving them up even one frame longer would
    // light up whatever those positions happen to map to in the new document.
    editorRef.current?.commands.clearRevisionOverlay()
    editorRef.current?.commands.clearPinnedSelection()
    editorRef.current?.commands.setContent(html)
    setContentHtml(html)
    // Adopts the server's version rather than incrementing our own -- autosave
    // bumps the real version on every keystroke save without ever telling this
    // state about it, so guessing prev.version + 1 here drifts below the
    // truth and corrupts the autosave hook's own tracking (fed back in as
    // initialVersion), producing a spurious version-conflict banner on the
    // very next save.
    setDraft((prev) => (prev ? { ...prev, version: version ?? prev.version + 1 } : prev))
    // A scoped revision already showed its diff in place, at the passage --
    // opening the whole-document "Show edits" view on top of that would be
    // exactly the full-page swap this was built to avoid. A whole-document
    // revision has no such in-place view, so it still opens one to review.
    if (!wasScoped) setShowEdits(nextRevisions.length > 0)
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

  const addRevision = useCallback(
    async (instruction: string) => {
      // Once autosave has hit a version conflict, nothing typed here since
      // has actually reached the server -- flush() would only re-send a PATCH
      // that 409s again, and the copy revise.ts matches selections against is
      // stuck on whatever the server had before the conflict. Every revision
      // attempted in that state fails with "the selected passage changed",
      // which is true but misleading: the passage didn't move, the document
      // just stopped saving. Reloading (the banner's own prompt) is the only
      // way out, so there's nothing productive to do here until then.
      if (conflict) return
      // The passage just selected may be text the advocate typed a moment
      // ago and autosave hasn't reached the server yet -- revising against
      // the server's stale copy would fail to find it. Flushing first makes
      // sure the copy the revise route matches against is current.
      await flush()
      await revisionsApi.addRevision(instruction, editorSelection.selection)
    },
    [conflict, flush, revisionsApi, editorSelection.selection]
  )

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

    // The form this draft was started from is a source in its own right.
    if (draft.templateTitle) {
      seen.set(draft.templateTitle, {
        label: draft.templateTitle,
        sublabel: templateInfo ? `Version ${templateInfo.pinnedVersion}` : undefined,
      })
    }
    return [...seen.values()]
  }, [draft, templateInfo])

  if (loadState === "loading") {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-background">
        <div className="w-10 h-10 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (loadState === "missing" || !draft) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-background">
        <div className="max-w-sm text-center rounded-xl border border-gray-200 dark:border-border p-8">
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

  // A revision streams into the redline, so the diff comes up on its own while
  // one is arriving, stays up while it awaits approval, and stays up
  // afterwards if there is something to read. A revision scoped to a
  // selection is the exception: it shows in place, at the passage itself
  // (DocumentSurface's InlineEditComposer + revisionOverlayExtension), so the
  // whole-document view is never swapped out for it.
  const showRedline =
    showEdits ||
    (revisionsApi.isGenerating && !revisionsApi.scopedSelection) ||
    (revisionsApi.hasPendingApproval && !revisionsApi.scopedSelection)

  return (
    <div className="h-full flex flex-col bg-white dark:bg-background">
      {conflict && (
        <div className="shrink-0 border-b border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-5 sm:px-8 py-2.5 flex flex-wrap items-center gap-3">
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
              className="h-7 px-3 rounded-lg border border-amber-300 dark:border-amber-500/30 text-[12px] font-medium text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors cursor-pointer"
            >
              Copy my version
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-7 px-3 rounded-lg bg-amber-600 text-white text-[12px] font-medium hover:bg-amber-700 transition-colors cursor-pointer"
            >
              Reload
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col">
        {templateInfo?.hasNewerVersion && (
          <div className="shrink-0 px-5 sm:px-8 pt-3">
            <TemplateVersionBanner
              draftId={draftId}
              pinnedVersion={templateInfo.pinnedVersion}
              latestVersion={templateInfo.latestVersion}
            />
          </div>
        )}

        <div className="flex-1 min-h-0">
          <DocumentSurface
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
            status={draft.status}
            updatedAt={draft.updatedAt}
            templateTitle={draft.templateTitle}
            showEdits={showRedline}
            redlineHtml={revisionsApi.redlineHtml}
            streaming={revisionsApi.isGenerating}
            selection={editorSelection.selection}
            onAddRevision={addRevision}
            revisionBusy={revisionsApi.isGenerating}
            hasPendingApproval={revisionsApi.hasPendingApproval}
            pendingApprovalInstruction={revisionsApi.awaitingApprovalInstruction}
            onApproveRevision={revisionsApi.approve}
            onRejectRevision={revisionsApi.reject}
            activeScope={revisionsApi.scopedSelection}
            passageRedlineHtml={revisionsApi.passageRedlineHtml}
            onOpenAssistant={() => setAssistantOpen(true)}
            rail={
              <DocumentMetaRail
                revisions={revisionsApi.revisions}
                pendingInstruction={revisionsApi.pendingInstruction}
                error={revisionsApi.error}
                onAddRevision={addRevision}
                onCancel={revisionsApi.cancel}
                onRevert={revisionsApi.revert}
                showEdits={showEdits}
                onShowEditsChange={setShowEdits}
                selection={editorSelection.selection}
                sources={draftSources}
                disabled={revisionsApi.hasPendingApproval || conflict}
                conflict={conflict}
              />
            }
          />
        </div>
      </div>

      {/* The assistant, over the document rather than beside it. */}
      {assistantOpen && (
        <>
          <button
            type="button"
            aria-label="Close the assistant"
            onClick={() => setAssistantOpen(false)}
            className="fixed inset-0 z-40 bg-black/10 dark:bg-black/40 lg:bg-transparent cursor-default"
          />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[440px] bg-white dark:bg-card border-l border-gray-200 dark:border-border shadow-[-12px_0_40px_-24px_rgba(15,23,42,0.4)] flex flex-col">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-border">
              <h2 className="text-[13px] font-semibold text-gray-900 dark:text-foreground">Assistant</h2>
              <button
                type="button"
                onClick={() => setAssistantOpen(false)}
                aria-label="Close"
                className="rounded p-1 text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
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
                embedded
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
