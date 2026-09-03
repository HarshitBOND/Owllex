"use client"

import { useEffect, useRef, useState } from "react"
import type { Editor } from "@tiptap/react"
import { FileText } from "lucide-react"
import ContractUploadState from "./ContractUploadState"
import ContractDocumentPanel from "./ContractDocumentPanel"
import ContractInsightsPanel from "./ContractInsightsPanel"
import ContractFixWithAiPanel from "./ContractFixWithAiPanel"
import { useDraftAutosave } from "@/features/draft-documents/hooks/useDraftAutosave"
import { DEFAULT_TYPOGRAPHY, type ContractFileMeta, type ContractIssue, type ContractSummary } from "../data"

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
  version: number
  fileMeta: ContractFileMeta
}

interface AnalyzeResponse {
  success: boolean
  error?: string
  issues: ContractIssue[]
  summary: ContractSummary
}

interface ContractReviewWorkspaceProps {
  onStatusChange?: (status: "idle" | "analyzing" | "ready") => void
  onIssuesChange?: (issues: ContractIssue[], fileMeta: ContractFileMeta | null) => void
}

export default function ContractReviewWorkspace({ onStatusChange, onIssuesChange }: ContractReviewWorkspaceProps) {
  const editorRef = useRef<Editor | null>(null)

  const [reviewId, setReviewId] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [fileMeta, setFileMeta] = useState<ContractFileMeta | null>(null)
  const [contentHtml, setContentHtml] = useState("")
  const [typography, setTypography] = useState(DEFAULT_TYPOGRAPHY)
  const [version, setVersion] = useState(0)
  const [issues, setIssues] = useState<ContractIssue[]>([])
  const [summary, setSummary] = useState<ContractSummary | null>(null)
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const [resolvedIssueIds, setResolvedIssueIds] = useState<Set<string>>(new Set())
  const [chatOpen, setChatOpen] = useState(false)

  const autosave = useDraftAutosave(reviewId ?? "pending", version, "/api/contract-review")

  useEffect(() => {
    const uiStatus = status === "idle" ? "idle" : status === "ready" ? "ready" : "analyzing"
    onStatusChange?.(uiStatus)
  }, [status, onStatusChange])

  useEffect(() => {
    onIssuesChange?.(issues, fileMeta)
  }, [issues, fileMeta, onIssuesChange])

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

  const handleUpload = async (file: File) => {
    setUploadError(null)
    setFileMeta({ name: file.name, size: file.size, uploadedLabel: "Uploaded just now" })
    setSelectedIssueId(null)
    setResolvedIssueIds(new Set())
    setContentHtml("")
    setStatus("extracting")

    const formData = new FormData()
    formData.append("file", file)
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
    setIssues([])
    setSummary(null)
    setSelectedIssueId(null)
    setResolvedIssueIds(new Set())
    setUploadError(null)
    setAnalyzeError(null)
    setChatOpen(false)
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
    <div className="flex flex-col xl:flex-row gap-4 items-start">
      <ContractDocumentPanel
        fileMeta={fileMeta}
        reviewId={reviewId}
        contentHtml={contentHtml}
        typography={typography}
        onTypographyChange={handleTypographyChange}
        onContentChange={handleContentChange}
        onEditorReady={(editor) => {
          editorRef.current = editor
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
      />
      <ContractInsightsPanel
        isAnalyzing={status === "analyzing"}
        error={status === "error" ? analyzeError : null}
        issues={issues}
        summary={summary}
        selectedIssueId={selectedIssueId}
        onSelectIssue={setSelectedIssueId}
        resolvedIssueIds={resolvedIssueIds}
        onToggleResolved={toggleResolved}
        onOpenChat={() => setChatOpen(true)}
      />
      {status === "ready" && reviewId && (
        <ContractFixWithAiPanel
          reviewId={reviewId}
          issues={issues}
          resolvedIssueIds={resolvedIssueIds}
          getDocumentHtml={() => contentHtml}
          onApply={applyChatEdit}
          open={chatOpen}
          onOpenChange={setChatOpen}
        />
      )}
    </div>
  )
}
