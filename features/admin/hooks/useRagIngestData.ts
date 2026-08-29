import { useCallback, useState } from "react"
import type { RagIngestItem, RagSearchResult, RagStatus } from "../types"

export function useRagIngestData() {
  const [queue, setQueue] = useState<RagIngestItem[]>([])
  const [status, setStatus] = useState<RagStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)

  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<RagSearchResult[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  const fetchRagStatus = useCallback(async () => {
    setStatusLoading(true)
    setStatusError(null)
    try {
      const res = await fetch("/api/admin/rag/status")
      const data = await res.json()
      if (data.success) {
        setStatus(data)
      } else {
        setStatus(null)
        setStatusError(data.error || "Could not read RAG status")
      }
    } catch {
      setStatus(null)
      setStatusError("Network error while reading RAG status")
    } finally {
      setStatusLoading(false)
    }
  }, [])

  const runSearch = useCallback(async () => {
    const query = searchQuery.trim()
    if (!query) return

    setSearching(true)
    setSearchError(null)
    try {
      const res = await fetch("/api/admin/rag/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, k: 5 }),
      })
      const data = await res.json()
      if (data.success) {
        setSearchResults(data.results)
      } else {
        setSearchResults(null)
        setSearchError(data.error || "Search failed")
      }
    } catch {
      setSearchResults(null)
      setSearchError("Network error while searching")
    } finally {
      setSearching(false)
    }
  }, [searchQuery])

  const addFiles = useCallback((files: File[]) => {
    const items: RagIngestItem[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      status: "pending",
    }))
    setQueue((prev) => [...items, ...prev])
  }, [])

  const removeItem = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const clearFinished = useCallback(() => {
    setQueue((prev) => prev.filter((item) => item.status === "pending" || item.status === "uploading"))
  }, [])

  const uploadItem = useCallback(
    async (item: RagIngestItem) => {
      setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "uploading", error: undefined } : q)))

      try {
        const formData = new FormData()
        formData.append("file", item.file)

        const res = await fetch("/api/admin/rag/ingest", { method: "POST", body: formData })
        const data = await res.json()

        if (data.success) {
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    status: "success",
                    skipped: Boolean(data.skipped),
                    documentId: data.skipped ? data.existing_document_id : data.document_id,
                    title: data.title,
                    documentType: data.document_type,
                    chunkCount: data.chunk_count,
                  }
                : q
            )
          )
        } else {
          setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "failed", error: data.error || "Ingestion failed" } : q)))
        }
      } catch {
        setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "failed", error: "Network error" } : q)))
      }
    },
    []
  )

  const uploadAll = useCallback(async () => {
    for (const item of queue.filter((q) => q.status === "pending")) {
      await uploadItem(item)
    }
    // Counts move once documents land, so refresh them after the run.
    fetchRagStatus()
  }, [queue, uploadItem, fetchRagStatus])

  return {
    queue,
    addFiles,
    removeItem,
    clearFinished,
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
  }
}
