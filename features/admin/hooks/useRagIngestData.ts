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
      let data: RagStatus & { success?: boolean; error?: string }
      try {
        data = await res.json()
      } catch {
        throw new Error(`Server returned an invalid response (status ${res.status})`)
      }
      if (data.success) {
        setStatus(data)
      } else {
        setStatus(null)
        setStatusError(data.error || "Could not read RAG status")
      }
    } catch (err) {
      setStatus(null)
      setStatusError(err instanceof Error ? err.message : "Network error while reading RAG status")
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

  const groupItems = useCallback((orderedIds: string[]) => {
    setQueue((prev) => {
      const chosen = orderedIds
        .map((id) => prev.find((q) => q.id === id))
        .filter((q): q is RagIngestItem => q !== undefined && q.status === "pending")
      if (chosen.length < 2) return prev

      const pages = chosen.map((q) => q.file)
      const grouped: RagIngestItem = {
        id: `group-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file: pages[0],
        pages,
        status: "pending",
      }
      return [grouped, ...prev.filter((q) => !orderedIds.includes(q.id))]
    })
  }, [])

  const reorderGroupPage = useCallback((itemId: string, fromIndex: number, toIndex: number) => {
    setQueue((prev) =>
      prev.map((q) => {
        if (q.id !== itemId || !q.pages) return q
        if (toIndex < 0 || toIndex >= q.pages.length) return q
        const pages = [...q.pages]
        const [moved] = pages.splice(fromIndex, 1)
        pages.splice(toIndex, 0, moved)
        return { ...q, pages, file: pages[0] }
      })
    )
  }, [])

  const ungroupItem = useCallback((itemId: string) => {
    setQueue((prev) => {
      const target = prev.find((q) => q.id === itemId)
      if (!target?.pages) return prev
      const restored: RagIngestItem[] = target.pages.map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        status: "pending",
      }))
      return [...restored, ...prev.filter((q) => q.id !== itemId)]
    })
  }, [])

  const uploadItem = useCallback(
    async (item: RagIngestItem) => {
      setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "uploading", error: undefined } : q)))

      try {
        const formData = new FormData()
        if (item.pages && item.pages.length > 1) {
          item.pages.forEach((page, idx) => {
            const safeName = `${String(idx).padStart(3, "0")}__${page.name}`
            formData.append("files", new File([page], safeName, { type: page.type }))
          })
        } else {
          formData.append("file", item.file)
        }

        const res = await fetch("/api/admin/rag/ingest", { method: "POST", body: formData })
        const data = await res.json()

        if (data.success) {
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    status: "success",
                    documentId: data.document_id,
                    title: data.title,
                    documentType: data.document_type,
                    chunkCount: data.chunk_count,
                  }
                : q
            )
          )
        } else {
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    status: "failed",
                    error: data.error || "Ingestion failed",
                    duplicate: Boolean(data.duplicate),
                    documentId: data.existingDocumentId,
                  }
                : q
            )
          )
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
  }
}
