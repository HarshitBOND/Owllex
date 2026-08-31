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
    try {
      const res = await fetch(`/api/contract-review/${id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!data.success) {
        setAnalyzeError(data.error || "Analysis failed")
        setStatus("error")
        return
      }
      setIssues(data.issues)
      setSummary(data.summary)
      setStatus("ready")
    } catch {
      setAnalyzeError("Couldn't reach the AI reviewer. Check your connection and try again.")
      setStatus("error")
    }
  }

  const handleUpload = async (file: File) => {
    setUploadError(null)
    setFileMeta({ name: file.name, size: file.size, uploadedLabel: "Uploaded just now" })
    setSelectedIssueId(null)
    setResolvedIssueIds(new Set())
    setContentHtml("")
    setStatus("extracting")

    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/contract-review", { method: "POST", body: formData })
      const data = await res.json()

      if (!data.success) {
        setUploadError(data.error || "Upload failed")
        setStatus("idle")
        setFileMeta(null)
        return
      }

      setReviewId(data.id)
      setContentHtml(data.contentHtml)
      setTypography(data.typography)
      setVersion(data.version)
      setFileMeta(data.fileMeta)

      await runAnalyze(data.id)
    } catch {
      setUploadError("Couldn't reach the server. Check your connection and try again.")
      setStatus("idle")
      setFileMeta(null)
    }
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
