import { useCallback, useState } from "react"
import type { SuggestionCounts, SuggestionModerationItem, SuggestionStatus } from "../types"
import { defaultSuggestionCounts } from "../utils"

export function useSuggestionModeration(isSupport: boolean | null) {
  const [suggestions, setSuggestions] = useState<SuggestionModerationItem[]>([])
  const [suggestionCounts, setSuggestionCounts] = useState<SuggestionCounts>(defaultSuggestionCounts)
  const [suggestionStatusFilter, setSuggestionStatusFilter] = useState<"all" | SuggestionStatus>("pending")
  const [suggestionSearch, setSuggestionSearch] = useState("")
  const [suggestionLoading, setSuggestionLoading] = useState(true)
  const [suggestionUpdatingId, setSuggestionUpdatingId] = useState<string | null>(null)
  const [suggestionNotesById, setSuggestionNotesById] = useState<Record<string, string>>({})

  const fetchSuggestions = useCallback(async () => {
    if (!isSupport) return

    setSuggestionLoading(true)

    try {
      const params = new URLSearchParams({
        page: "1",
        limit: "20",
      })

      if (suggestionStatusFilter !== "all") {
        params.set("status", suggestionStatusFilter)
      }

      if (suggestionSearch.trim()) {
        params.set("search", suggestionSearch.trim())
      }

      const response = await fetch(`/api/support/suggestions?${params.toString()}`)
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to fetch suggestions")
      }

      setSuggestions(data.suggestions || [])
      setSuggestionCounts(data.counts || defaultSuggestionCounts)
      setSuggestionNotesById((prev) => {
        const next = { ...prev }
        ;(data.suggestions || []).forEach((item: SuggestionModerationItem) => {
          if (typeof next[item._id] === "undefined") {
            next[item._id] = item.adminNotes || ""
          }
        })
        return next
      })
    } catch (error) {
      console.error("Suggestions moderation fetch error:", error)
      setSuggestions([])
      setSuggestionCounts(defaultSuggestionCounts)
    } finally {
      setSuggestionLoading(false)
    }
  }, [isSupport, suggestionStatusFilter, suggestionSearch])

  const updateSuggestionStatus = async (suggestionId: string, status: SuggestionStatus) => {
    setSuggestionUpdatingId(suggestionId)

    try {
      const response = await fetch("/api/support/suggestions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestionId,
          status,
          adminNotes: suggestionNotesById[suggestionId] || "",
        }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to update suggestion status")
      }

      await fetchSuggestions()
    } catch (error) {
      console.error("Suggestion status update error:", error)
    } finally {
      setSuggestionUpdatingId(null)
    }
  }

  return {
    suggestions,
    suggestionCounts,
    suggestionStatusFilter,
    setSuggestionStatusFilter,
    suggestionSearch,
    setSuggestionSearch,
    suggestionLoading,
    suggestionUpdatingId,
    suggestionNotesById,
    setSuggestionNotesById,
    fetchSuggestions,
    updateSuggestionStatus,
  }
}
