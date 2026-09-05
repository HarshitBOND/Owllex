"use client"

import { useEffect, useRef, useState } from "react"
import type { Editor } from "@tiptap/react"
import { FileText } from "lucide-react"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import ContractUploadState from "./ContractUploadState"
import ContractDocumentPanel from "./ContractDocumentPanel"
import ContractReviewRail from "./ContractReviewRail"
import ContractFixWithAiPanel from "./ContractFixWithAiPanel"
import { useDraftAutosave } from "@/features/draft-documents/hooks/useDraftAutosave"
import { useRevisions } from "@/hooks/useRevisions"
import { useEditorSelection } from "@/hooks/useEditorSelection"
import type { Revision } from "@/hooks/useRevisions"
import {
  DEFAULT_TYPOGRAPHY,
  type ContractFileMeta,
  type ContractIssue,
  type ContractSummary,
  type ExtractionMode,
} from "../data"

type Status = "idle" | "extracting" | "analyzing" | "ready" | "error"

type RouteResult<T> = { ok: true; data: T } | { ok: false; message: string }

/**
 * Ceiling for one call, sitting above the routes' own 300s maxDuration so the
 * server's real message wins whenever there is one. Without any ceiling a
 * request that never gets answered leaves the page spinning indefinitely.
 */
const ROUTE_TIMEOUT_MS = 320_000

/**
 * Calls one of this feature's routes and comes back with either parsed JSON or a
 * message describing what actually went wrong.
 *
 * Reading the body inside the same try as the fetch used to conflate two very
 * different failures: a route that dies outside its own error handling -- a
 * gateway timeout on a slow extraction, a body over the upload limit, a killed
 * function -- answers with an HTML error page, and json() then throws exactly
 * like an offline network does. Both surfaced as "check your connection", which
 * sends people to their router over a backend that was merely slow.
 */
async function callRoute<T>(input: string, init: RequestInit): Promise<RouteResult<T>> {
  let res: Response
  try {
    res = await fetch(input, { ...init, signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS) })
  } catch (error) {
    // A timeout here is not the same as being offline, and saying so sent people
    // to their router over a document that was simply still being OCR'd.
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return {
        ok: false,
        message:
          "The document is taking longer than expected and the request timed out. Scanned contracts are the slow case -- try again, or upload a smaller file.",
      }
    }
    return { ok: false, message: "Couldn't reach the server. Check your connection and try again." }
  }

  try {
    return { ok: true, data: (await res.json()) as T }
  } catch {
    if (res.status === 413) {
      return { ok: false, message: "That file is too large to upload. Try a smaller document." }
    }
    if (res.status === 408 || res.status === 504) {
      return {
        ok: false,
        message: "The server took too long to respond. Large or scanned documents can time out -- try again, or upload a smaller file.",
      }
    }
    return { ok: false, message: `The server returned an unreadable response (HTTP ${res.status}). Please try again.` }
  }
}

interface UploadResponse {
  success: boolean
  error?: string
  id: string
  contentHtml: string
  typography: typeof DEFAULT_TYPOGRAPHY
  pageCount: number
  version: number
  fileMeta: ContractFileMeta
}

interface AnalyzeResponse {
  success: boolean
  error?: string
  issues: ContractIssue[]
  summary: ContractSummary
}

interface ReviewResponse {
  success: boolean
  error?: string
  review: {
    id: string
    fileName: string
    size: number
    contentHtml: string
    typography: typeof DEFAULT_TYPOGRAPHY
    status: Status
    errorMessage: string
    issues: ContractIssue[]
    summary: ContractSummary | null
    revisions: Revision[]
    pageCount: number
    version: number
  }
}

export interface ContractReviewMeta {
  revisionCount: number
  sourceCount: number
  createdAt: string
}

interface ContractReviewWorkspaceProps {
  onStatusChange?: (status: "idle" | "analyzing" | "ready") => void
  onReviewIdChange?: (reviewId: string | null) => void
  /** Feeds the header's "Draft · N revisions · 1 source · Created …" line. */
  onMetaChange?: (meta: ContractReviewMeta | null) => void
}

/** Panels only split side-by-side at the same `xl` breakpoint the rest of this layout uses. */
function useIsWideScreen() {
  const [isWide, setIsWide] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1280px)")
    setIsWide(mql.matches)
    const onChange = (e: MediaQueryListEvent) => setIsWide(e.matches)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])
  return isWide
}

export default function ContractReviewWorkspace({
  onStatusChange,
  onReviewIdChange,
  onMetaChange,
}: ContractReviewWorkspaceProps) {
  const editorRef = useRef<Editor | null>(null)
  const isWideScreen = useIsWideScreen()

  const [reviewId, setReviewId] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [fileMeta, setFileMeta] = useState<ContractFileMeta | null>(null)
  const [contentHtml, setContentHtml] = useState("")
  const [typography, setTypography] = useState(DEFAULT_TYPOGRAPHY)
  const [version, setVersion] = useState(0)
  const [pageCount, setPageCount] = useState(0)
  const [issues, setIssues] = useState<ContractIssue[]>([])
  const [summary, setSummary] = useState<ContractSummary | null>(null)
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const [resolvedIssueIds, setResolvedIssueIds] = useState<Set<string>>(new Set())
  const [chatOpen, setChatOpen] = useState(false)
  const [showEdits, setShowEdits] = useState(false)
  const editorSelection = useEditorSelection()

  const autosave = useDraftAutosave(reviewId ?? "pending", version, "/api/contract-review")

  /**
   * Puts a finished revision into the editor.
   *
   * The server has already written contentHtml and bumped version, so this
   * syncs local state to that rather than queueing another save -- autosaving
   * the same text back would just lose the race with its own PATCH.
   */
  const applyRevision = (html: string, nextRevisions: Revision[]) => {
    editorRef.current?.commands.setContent(html)
    setContentHtml(html)
    setVersion((current) => current + 1)
    setShowEdits(nextRevisions.length > 0)
  }

  const revisionsApi = useRevisions(reviewId, "/api/contract-review", {
    currentHtml: contentHtml,
    onApplied: applyRevision,
  })

  useEffect(() => {
    const uiStatus = status === "idle" ? "idle" : status === "ready" ? "ready" : "analyzing"
    onStatusChange?.(uiStatus)
  }, [status, onStatusChange])

  useEffect(() => {
    onReviewIdChange?.(reviewId)
  }, [reviewId, onReviewIdChange])

  useEffect(() => {
    if (!fileMeta) {
      onMetaChange?.(null)
      return
    }
    onMetaChange?.({
      revisionCount: revisionsApi.revisions.length,
      sourceCount: 1,
      createdAt: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    })
  }, [fileMeta, revisionsApi.revisions.length, onMetaChange])

  // Puts the review in the URL so a refresh (or a shared link) reopens it.
  // replaceState rather than a router push: this is the same page, and a back
  // button that walked through every upload would be noise.
  useEffect(() => {
    if (!reviewId) return
    const url = new URL(window.location.href)
    if (url.searchParams.get("id") === reviewId) return
    url.searchParams.set("id", reviewId)
    window.history.replaceState(null, "", url.toString())
  }, [reviewId])

  /**
   * Reopens the review named in ?id= .
   *
   * Until now the workspace only ever held the review created in this session:
   * the GET route existed but nothing called it, so a refresh dropped the
   * document, the issues and the chat history. Revisions would have gone the
   * same way, and a timeline that vanishes on reload is worse than none.
   */
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id")
    if (!id) return

    let cancelled = false
    setStatus("extracting")
    ;(async () => {
      const result = await callRoute<ReviewResponse>(`/api/contract-review/${id}`, { method: "GET" })
      if (cancelled) return

      if (!result.ok || !result.data.success) {
        setUploadError(result.ok ? result.data.error || "Couldn't open that review" : result.message)
        setStatus("idle")
        return
      }

      const { review } = result.data
      setReviewId(review.id)
      setContentHtml(review.contentHtml)
      setTypography(review.typography)
      setVersion(review.version)
      setPageCount(review.pageCount ?? 0)
      setIssues(review.issues)
      setSummary(review.summary)
      setFileMeta({ name: review.fileName, size: review.size, uploadedLabel: "Saved review" })
      revisionsApi.setRevisions(review.revisions ?? [])
      setStatus(review.status === "error" ? "error" : "ready")
      if (review.status === "error") setAnalyzeError(review.errorMessage)
    })()

    return () => {
      cancelled = true
    }
    // Runs once on mount: the id comes from the URL, not from state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runAnalyze = async (id: string) => {
    setStatus("analyzing")
    setAnalyzeError(null)
    const result = await callRoute<AnalyzeResponse>(`/api/contract-review/${id}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })

    if (!result.ok) {
      setAnalyzeError(result.message)
      setStatus("error")
      return
    }
    if (!result.data.success) {
      setAnalyzeError(result.data.error || "Analysis failed")
      setStatus("error")
      return
    }

    setIssues(result.data.issues)
    setSummary(result.data.summary)
    setStatus("ready")
  }

  const handleUpload = async (file: File, extractionMode: ExtractionMode) => {
    setUploadError(null)
    setFileMeta({ name: file.name, size: file.size, uploadedLabel: "Uploaded just now" })
    setSelectedIssueId(null)
    setResolvedIssueIds(new Set())
    setContentHtml("")
    setStatus("extracting")

    const formData = new FormData()
    formData.append("file", file)
    formData.append("extractionMode", extractionMode)
    const result = await callRoute<UploadResponse>("/api/contract-review", { method: "POST", body: formData })

    if (!result.ok || !result.data.success) {
      setUploadError(result.ok ? result.data.error || "Upload failed" : result.message)
      setStatus("idle")
      setFileMeta(null)
      return
    }

    const data = result.data
    setReviewId(data.id)
    setContentHtml(data.contentHtml)
    setTypography(data.typography)
    setVersion(data.version)
    setPageCount(data.pageCount ?? 0)
    setFileMeta(data.fileMeta)

    await runAnalyze(data.id)
  }

  const handleReupload = () => {
    setStatus("idle")
    setReviewId(null)
    setFileMeta(null)
    setContentHtml("")
    setTypography(DEFAULT_TYPOGRAPHY)
    setVersion(0)
    setPageCount(0)
    setIssues([])
    setSummary(null)
    setSelectedIssueId(null)
    setResolvedIssueIds(new Set())
    setUploadError(null)
    setAnalyzeError(null)
    setChatOpen(false)
    setShowEdits(false)
    revisionsApi.setRevisions([])

    const url = new URL(window.location.href)
    url.searchParams.delete("id")
    window.history.replaceState(null, "", url.toString())
  }

  const handleRerun = () => {
    if (!reviewId) return
    setSelectedIssueId(null)
    setResolvedIssueIds(new Set())
    runAnalyze(reviewId)
  }

  const handleContentChange = (html: string, wordCount: number) => {
    setContentHtml(html)
    autosave.queue({ contentHtml: html, wordCount })
  }

  const handleTypographyChange = (next: { fontFamily: string; fontSizePt: number }) => {
    setTypography(next)
    autosave.queue({ typography: next })
  }

  const applyChatEdit = (html: string) => {
    editorRef.current?.commands.setContent(html)
    setContentHtml(html)
    autosave.queue({ contentHtml: html })
  }

  const toggleResolved = (issueId: string) => {
    setResolvedIssueIds((prev) => {
      const next = new Set(prev)
      if (next.has(issueId)) next.delete(issueId)
      else next.add(issueId)
      return next
    })
  }

  if (status === "idle" || !fileMeta) {
    return <ContractUploadState onUpload={handleUpload} error={uploadError} />
  }

  if (status === "extracting" && !contentHtml) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-[60vh] rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
          <FileText className="w-5 h-5 text-accent animate-pulse" />
        </div>
        <p className="text-sm font-medium text-gray-900 dark:text-foreground">Extracting {fileMeta.name}…</p>
        <p className="text-xs text-muted-foreground">Scanned documents can take a little longer for OCR.</p>
      </div>
    )
  }

  return (
    <div className="h-[75vh] xl:h-[calc(100vh-190px)]">
      <PanelGroup
        key={isWideScreen ? "horizontal" : "vertical"}
        direction={isWideScreen ? "horizontal" : "vertical"}
        autoSaveId={isWideScreen ? "contract-review-split" : undefined}
        className="gap-4"
      >
        <Panel defaultSize={70} minSize={40}>
          <ContractDocumentPanel
            fileMeta={fileMeta}
            reviewId={reviewId}
            contentHtml={contentHtml}
            typography={typography}
            onTypographyChange={handleTypographyChange}
            onContentChange={handleContentChange}
            onEditorReady={(editor) => {
              editorRef.current = editor
              editorSelection.attach(editor)
            }}
            saveStatus={autosave.status}
            onRetrySave={autosave.retry}
            issues={issues}
            selectedIssueId={selectedIssueId}
            onSelectIssue={setSelectedIssueId}
            resolvedIssueIds={resolvedIssueIds}
            onReupload={handleReupload}
            onRerun={handleRerun}
            isReanalyzing={status === "analyzing"}
            showEdits={showEdits}
            redlineHtml={revisionsApi.redlineHtml}
          />
        </Panel>
        <PanelResizeHandle
          className={
            isWideScreen
              ? "flex w-2 shrink-0 items-center justify-center group"
              : "flex h-2 shrink-0 items-center justify-center group"
          }
        >
          <div
            className={
              isWideScreen
                ? "w-1 h-10 rounded-full bg-gray-200 dark:bg-border group-hover:bg-accent group-data-[resize-handle-state=drag]:bg-accent transition-colors"
                : "h-1 w-10 rounded-full bg-gray-200 dark:bg-border group-hover:bg-accent group-data-[resize-handle-state=drag]:bg-accent transition-colors"
            }
          />
        </PanelResizeHandle>
        <Panel defaultSize={30} minSize={22}>
          <ContractReviewRail
            isAnalyzing={status === "analyzing"}
            analyzeError={status === "error" ? analyzeError : null}
            issues={issues}
            summary={summary}
            selectedIssueId={selectedIssueId}
            onSelectIssue={setSelectedIssueId}
            resolvedIssueIds={resolvedIssueIds}
            onToggleResolved={toggleResolved}
            onOpenChat={() => setChatOpen(true)}
            revisions={revisionsApi.revisions}
            pendingInstruction={revisionsApi.pendingInstruction}
            revisionError={revisionsApi.error}
            onAddRevision={(instruction) => revisionsApi.addRevision(instruction, editorSelection.selection)}
            onCancelRevision={revisionsApi.cancel}
            onRevert={revisionsApi.revert}
            showEdits={showEdits}
            onShowEditsChange={setShowEdits}
            selection={editorSelection.selection}
            sources={
              fileMeta
                ? [
                    {
                      label: fileMeta.name,
                      sublabel: pageCount ? `${pageCount} page${pageCount === 1 ? "" : "s"}` : "Original upload",
                    },
                  ]
                : []
            }
          />
        </Panel>
      </PanelGroup>
      {status === "ready" && reviewId && (
        <ContractFixWithAiPanel
          reviewId={reviewId}
          issues={issues}
          resolvedIssueIds={resolvedIssueIds}
          getDocumentHtml={() => contentHtml}
          onApply={applyChatEdit}
          onSelectIssue={setSelectedIssueId}
          open={chatOpen}
          onOpenChange={setChatOpen}
        />
      )}
    </div>
  )
}
