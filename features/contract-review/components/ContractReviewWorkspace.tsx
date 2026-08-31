"use client"

import { useEffect, useState } from "react"
import ContractUploadState from "./ContractUploadState"
import ContractDocumentPanel from "./ContractDocumentPanel"
import ContractInsightsPanel from "./ContractInsightsPanel"
import ContractFixWithAiPanel from "./ContractFixWithAiPanel"
import { defaultFileMeta, fixSuggestions, mockIssues, type ContractFileMeta } from "../data"

interface ContractReviewWorkspaceProps {
  initialFileName?: string | null
  onStatusChange?: (status: "idle" | "analyzing" | "ready") => void
  sampleRequestToken?: number
}

export default function ContractReviewWorkspace({
  initialFileName,
  onStatusChange,
  sampleRequestToken,
}: ContractReviewWorkspaceProps) {
  const [fileMeta, setFileMeta] = useState<ContractFileMeta | null>(
    initialFileName ? { ...defaultFileMeta, name: initialFileName } : null,
  )
  const [status, setStatus] = useState<"idle" | "analyzing" | "ready">(initialFileName ? "analyzing" : "idle")
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"document" | "insights">("document")
  const [fixedIssueIds, setFixedIssueIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (status !== "analyzing") return
    const timeout = setTimeout(() => setStatus("ready"), 1400)
    return () => clearTimeout(timeout)
  }, [status])

  useEffect(() => {
    onStatusChange?.(status)
  }, [status, onStatusChange])

  useEffect(() => {
    if (!sampleRequestToken) return
    setFileMeta({ name: "Sample_Service_Agreement.pdf", pages: defaultFileMeta.pages, uploadedLabel: "Uploaded just now" })
    setSelectedIssueId(null)
    setFixedIssueIds(new Set())
    setActiveTab("document")
    setStatus("analyzing")
  }, [sampleRequestToken])

  const handleUpload = (file: File) => {
    setFileMeta({ name: file.name, pages: defaultFileMeta.pages, uploadedLabel: "Uploaded just now" })
    setSelectedIssueId(null)
    setFixedIssueIds(new Set())
    setActiveTab("document")
    setStatus("analyzing")
  }

  const handleReupload = () => {
    setStatus("idle")
    setFileMeta(null)
    setSelectedIssueId(null)
    setFixedIssueIds(new Set())
  }

  const handleRerun = () => {
    setSelectedIssueId(null)
    setFixedIssueIds(new Set())
    setStatus("analyzing")
  }

  const handleFixIssue = (issueId: string) => {
    setFixedIssueIds((prev) => new Set(prev).add(issueId))
  }

  const handleFixAllCritical = () => {
    setFixedIssueIds((prev) => {
      const next = new Set(prev)
      mockIssues
        .filter((issue) => issue.severity === "critical" && fixSuggestions[issue.id])
        .forEach((issue) => next.add(issue.id))
      return next
    })
  }

  if (status === "idle" || !fileMeta) {
    return <ContractUploadState onUpload={handleUpload} />
  }

  return (
    <div className="flex flex-col xl:flex-row gap-4 items-start">
      <ContractDocumentPanel
        fileMeta={fileMeta}
        isAnalyzing={status === "analyzing"}
        selectedIssueId={selectedIssueId}
        onSelectIssue={setSelectedIssueId}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onReupload={handleReupload}
        onRerun={handleRerun}
        fixedIssueIds={fixedIssueIds}
      />
      <ContractInsightsPanel
        isAnalyzing={status === "analyzing"}
        selectedIssueId={selectedIssueId}
        onSelectIssue={setSelectedIssueId}
        fixedIssueIds={fixedIssueIds}
      />
      {status === "ready" && (
        <ContractFixWithAiPanel
          issues={mockIssues}
          fixedIssueIds={fixedIssueIds}
          onFixIssue={handleFixIssue}
          onFixAllCritical={handleFixAllCritical}
        />
      )}
    </div>
  )
}
