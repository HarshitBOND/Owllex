"use client"

import { Fragment, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Database, FileText, Layers, Loader2, RefreshCw, Search, Trash2, UploadCloud, X, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { RagIngestItem, RagSearchResult, RagStatus } from "../types"
import { cn } from "@/lib/utils"

interface RagIngestTabProps {
  queue: RagIngestItem[]
  addFiles: (files: File[]) => void
  removeItem: (id: string) => void
  clearFinished: () => void
  groupItems: (orderedIds: string[]) => void
  reorderGroupPage: (itemId: string, fromIndex: number, toIndex: number) => void
  ungroupItem: (itemId: string) => void
  uploadItem: (item: RagIngestItem) => Promise<void>
  uploadAll: () => void
  status: RagStatus | null
  statusError: string | null
  statusLoading: boolean
  fetchRagStatus: () => void
  searchQuery: string
  setSearchQuery: (value: string) => void
  searchResults: RagSearchResult[] | null
  searchError: string | null
  searching: boolean
  runSearch: () => void
}

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.txt,.md,.jpg,.jpeg,.png"

function isImageFile(name: string) {
  return /\.(jpe?g|png)$/i.test(name)
}

function statusIcon(item: RagIngestItem) {
  switch (item.status) {
    case "success":
      return <CheckCircle2 size={16} className="text-brand-600" />
    case "failed":
      return item.duplicate
        ? <AlertTriangle size={16} className="text-amber-600" />
        : <XCircle size={16} className="text-red-600" />
    case "uploading":
      return <Loader2 size={16} className="text-amber-600 animate-spin" />
    default:
      return <FileText size={16} className="text-gray-400" />
  }
}

function formatBytes(bytes: number) {
  if (!bytes) return "—"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
      <p className="text-lg font-semibold text-gray-900 dark:text-white">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  )
}

export function RagIngestTab({
  queue,
  addFiles,
  removeItem,
  clearFinished,
  groupItems,
  reorderGroupPage,
  ungroupItem,
  uploadItem,
  uploadAll,
  status,
  statusError,
  statusLoading,
  fetchRagStatus,
  searchQuery,
  setSearchQuery,
  searchResults,
  searchError,
  searching,
  runSearch,
}: RagIngestTabProps) {
  const [dragActive, setDragActive] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const pendingCount = queue.filter((q) => q.status === "pending").length
  const hasFinished = queue.some((q) => q.status === "success" || q.status === "failed")
  const blocked = Boolean(statusError) || (status !== null && !status.ready)

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleGroup = () => {
    groupItems([...selectedIds])
    setSelectedIds(new Set())
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) addFiles(files)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length) addFiles(files)
    e.target.value = ""
  }

  const ingestOne = async (item: RagIngestItem) => {
    await uploadItem(item)
    fetchRagStatus()
  }

  return (
    <div className="space-y-4">
      {/* Pipeline health */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Pipeline status</h3>
            {status && (
              <span
                className={cn(
                  "text-[11px] font-semibold px-2 py-0.5 rounded-full",
                  status.ready
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                    : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                )}
              >
                {status.ready ? "Ready" : "Not ready"}
              </span>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={fetchRagStatus} disabled={statusLoading} className="gap-1.5">
            <RefreshCw size={14} className={cn(statusLoading && "animate-spin")} /> Refresh
          </Button>
        </div>

        {statusError && (
          <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{statusError}</span>
          </div>
        )}

        {status && (
          <>
            {!status.openai_key_configured && (
              <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-3 py-2 mb-3">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  <b>OPENAI_API_KEY is not set.</b> Add it to <code>backend/.env</code> and restart the backend ingestion and
                  search both return 503 until then.
                </span>
              </div>
            )}
            {!status.chroma_configured && (
              <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-3 py-2 mb-3">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  <b>Chroma Cloud is not configured.</b> Add <code>CHROMA_API_KEY</code>, <code>CHROMA_TENANT</code>, and{" "}
                  <code>CHROMA_DATABASE</code> to <code>backend/.env</code> and restart the backend.
                </span>
              </div>
            )}
            {!status.dependencies_installed && (
              <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-3 py-2 mb-3">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  RAG dependencies are missing. Run <code>uv sync --extra rag</code> in <code>backend/</code>.
                </span>
              </div>
            )}
            {status.error && (
              <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2 mb-3">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{status.error}</span>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatCard label="Documents" value={status.document_count} />
              <StatCard label="Chunks" value={status.chunk_count} />
              <StatCard label="Hashes indexed" value={status.indexed_hashes} />
              <StatCard label="OpenAI key" value={status.openai_key_configured ? "Set" : "Missing"} />
            </div>
          </>
        )}
      </div>

      {/* Upload */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Ingest documents into the RAG pipeline</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Upload PDF, DOCX, TXT, MD files, or photos (JPG/PNG) of a physical document. Each document is parsed, chunked,
          embedded, and stored in the vector store for retrieval. Photographed a multi-page document? Select the pages
          below and use &quot;Group into one document&quot; so they&apos;re ingested together, in order. The first PDF
          after a backend restart takes ~60s extra while the layout model loads.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-10 cursor-pointer transition-colors",
            dragActive
              ? "border-sidebar-primary bg-sidebar-primary/5"
              : "border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600"
          )}
        >
          <UploadCloud size={28} className="text-gray-400" />
          <p className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-medium text-sidebar-primary">Click to browse</span> or drag and drop files here
          </p>
          <p className="text-xs text-gray-400">PDF, DOCX, TXT, MD, JPG, PNG up to 50MB per document</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS}
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {queue.length > 0 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">{queue.length} file(s) in queue</p>
            <div className="flex gap-2">
              {selectedIds.size >= 2 && (
                <Button size="sm" variant="outline" onClick={handleGroup} className="gap-1.5">
                  <Layers size={14} /> Group into one document ({selectedIds.size})
                </Button>
              )}
              {hasFinished && (
                <Button size="sm" variant="outline" onClick={clearFinished} className="gap-1.5">
                  <Trash2 size={14} /> Clear finished
                </Button>
              )}
              <Button size="sm" onClick={uploadAll} disabled={pendingCount === 0 || blocked} className="gap-1.5">
                <UploadCloud size={14} /> Ingest {pendingCount > 0 ? `(${pendingCount})` : ""}
              </Button>
            </div>
          </div>
        )}
      </div>

      {queue.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">File</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Size</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Result</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {queue.map((item) => {
                  const isGroup = Boolean(item.pages && item.pages.length > 1)
                  const groupable = item.status === "pending" && !item.pages && isImageFile(item.file.name)
                  const groupSize = item.pages ? item.pages.reduce((sum, p) => sum + p.size, 0) : item.file.size
                  return (
                  <Fragment key={item.id}>
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[260px]">
                      <div className="flex items-center gap-2">
                        {groupable && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelected(item.id)}
                            className="shrink-0"
                            aria-label={`Select ${item.file.name} for grouping`}
                          />
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="truncate">
                            {isGroup
                              ? `${item.pages!.length} pages · ${item.file.name}${item.pages!.length > 1 ? ` + ${item.pages!.length - 1} more` : ""}`
                              : item.file.name}
                          </span>
                          {isGroup && (
                            <button
                              type="button"
                              onClick={() => setExpandedGroupId(expandedGroupId === item.id ? null : item.id)}
                              className="text-[11px] text-sidebar-primary hover:underline text-left flex items-center gap-0.5 w-fit"
                            >
                              {expandedGroupId === item.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              {expandedGroupId === item.id ? "Hide pages" : "Show pages"}
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{formatBytes(groupSize)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize">
                        {statusIcon(item)} {item.status === "failed" && item.duplicate ? "duplicate" : item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 max-w-[280px]">
                      {item.status === "success" && (
                        <span>
                          {item.title || "Untitled"} · {item.documentType || "unknown"} · {item.chunkCount ?? 0} chunks
                        </span>
                      )}
                      {item.status === "failed" && item.duplicate && (
                        <span className="text-amber-600 dark:text-amber-400">Duplicate already ingested, upload blocked</span>
                      )}
                      {item.status === "failed" && !item.duplicate && <span className="text-red-600">{item.error}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        {item.status === "pending" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={blocked} onClick={() => ingestOne(item)}>
                            Ingest
                          </Button>
                        )}
                        {item.status === "failed" && !item.duplicate && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={blocked} onClick={() => ingestOne(item)}>
                            Retry
                          </Button>
                        )}
                        {item.status !== "uploading" && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => removeItem(item.id)}>
                            <X size={14} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isGroup && expandedGroupId === item.id && (
                    <tr className="bg-gray-50/50 dark:bg-gray-800/30">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              Pages, in order
                            </p>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs"
                              onClick={() => {
                                ungroupItem(item.id)
                                setExpandedGroupId(null)
                              }}
                            >
                              Ungroup
                            </Button>
                          </div>
                          {item.pages!.map((page, idx) => (
                            <div
                              key={`${item.id}-${idx}`}
                              className="flex items-center justify-between gap-2 rounded-md border border-gray-200 dark:border-gray-700 px-2.5 py-1.5"
                            >
                              <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                                {idx + 1}. {page.name}
                              </span>
                              <div className="flex gap-1 shrink-0">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
                                  disabled={idx === 0}
                                  onClick={() => reorderGroupPage(item.id, idx, idx - 1)}
                                >
                                  <ChevronUp size={12} />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
                                  disabled={idx === item.pages!.length - 1}
                                  onClick={() => reorderGroupPage(item.id, idx, idx + 1)}
                                >
                                  <ChevronDown size={12} />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Retrieval test */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-1">
          <Search size={16} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Test retrieval</h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Search the vector store to confirm an ingested document is actually retrievable. Lower distance means a closer match.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runSearch() }}
            placeholder="e.g. what did the court hold about bail?"
            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sidebar-primary/40"
          />
          <Button size="sm" onClick={runSearch} disabled={searching || blocked || !searchQuery.trim()} className="gap-1.5">
            {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Search
          </Button>
        </div>

        {searchError && (
          <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2 mt-3">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}

        {searchResults !== null && !searchError && (
          <div className="mt-3 space-y-2">
            {searchResults.length === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">No matches the store may still be empty.</p>
            )}
            {searchResults.map((hit, i) => (
              <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                    {hit.title || "Untitled"}
                    {hit.document_type ? ` · ${hit.document_type}` : ""}
                    {hit.date ? ` · ${hit.date}` : ""}
                  </p>
                  <span className="text-[11px] shrink-0 text-gray-500 dark:text-gray-400">distance {hit.score.toFixed(4)}</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-4 whitespace-pre-wrap">{hit.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
