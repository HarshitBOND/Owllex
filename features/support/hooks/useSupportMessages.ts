import { useCallback, useState } from "react"
import type { SupportCounts, SupportMessageItem, SupportStatus } from "../types"
import { defaultCounts } from "../utils"

export function useSupportMessages(isSupport: boolean | null) {
  const [messages, setMessages] = useState<SupportMessageItem[]>([])
  const [counts, setCounts] = useState<SupportCounts>(defaultCounts)
  const [statusFilter, setStatusFilter] = useState<"all" | SupportStatus>("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const fetchMessages = useCallback(async () => {
    if (!isSupport) return

    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      })

      if (statusFilter !== "all") {
        params.set("status", statusFilter)
      }

      if (search.trim()) {
        params.set("search", search.trim())
      }

      const response = await fetch(`/api/support/messages?${params.toString()}`)
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to fetch support messages")
      }

      setMessages(data.messages || [])
      setCounts(data.counts || defaultCounts)
      setTotalPages(data.totalPages || 1)
    } catch (error) {
      console.error("Support dashboard fetch error:", error)
      setMessages([])
      setCounts(defaultCounts)
      setTotalPages(1)
    } finally {
      setLoading(false)
    }
  }, [isSupport, page, search, statusFilter])

  const updateStatus = async (messageId: string, status: SupportStatus) => {
    setUpdatingId(messageId)

    try {
      const response = await fetch("/api/support/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, status }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to update message status")
      }

      await fetchMessages()
    } catch (error) {
      console.error("Support status update error:", error)
    } finally {
      setUpdatingId(null)
    }
  }

  return {
    messages,
    counts,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    page,
    setPage,
    totalPages,
    loading,
    updatingId,
    fetchMessages,
    updateStatus,
  }
}
