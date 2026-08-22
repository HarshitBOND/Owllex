import { useCallback, useEffect, useState } from "react"
import type { SuggestionFormData, SuggestionItem, SuggestionNotice, SuggestionStatus } from "../types"

export function useSuggestionsData(isSignedIn: boolean | undefined) {
  const [items, setItems] = useState<SuggestionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [ratingId, setRatingId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [statusFilter, setStatusFilter] = useState<"all" | SuggestionStatus>("all")
  const [notice, setNotice] = useState<SuggestionNotice>(null)
  const [formData, setFormData] = useState<SuggestionFormData>({
    title: "",
    description: "",
    category: "General",
  })

  const fetchSuggestions = useCallback(async () => {
    if (!isSignedIn) return

    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: "100",
      })

      if (search.trim()) params.set("search", search.trim())
      if (selectedCategory !== "All") params.set("category", selectedCategory)
      if (statusFilter !== "all") params.set("status", statusFilter)

      const response = await fetch(`/api/userdetails/suggestions?${params.toString()}`)
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to load suggestions")
      }

      setItems(data.suggestions || [])
    } catch (error) {
      console.error("Suggestions fetch error:", error)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [isSignedIn, search, selectedCategory, statusFilter])

  useEffect(() => {
    if (isSignedIn) {
      fetchSuggestions()
    }
  }, [isSignedIn, fetchSuggestions])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setNotice(null)
    setSaving(true)

    try {
      const response = await fetch("/api/userdetails/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to submit suggestion")
      }

      setFormData({ title: "", description: "", category: "General" })
      setNotice({ kind: "success", text: "Suggestion submitted for review." })
      await fetchSuggestions()
    } catch (error: any) {
      setNotice({
        kind: "error",
        text: error?.message || "Unable to submit suggestion. Please try again.",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleRateSuggestion = async (suggestionId: string, rating: number) => {
    setNotice(null)
    setRatingId(suggestionId)

    try {
      const response = await fetch(`/api/userdetails/suggestions/${suggestionId}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to submit rating")
      }

      setItems((previous) =>
        previous.map((item) => {
          if (item._id !== suggestionId) return item

          return {
            ...item,
            ratingAverage: Number(data.suggestion?.ratingAverage || item.ratingAverage),
            ratingCount: Number(data.suggestion?.ratingCount || item.ratingCount),
            myRating: Number(data.suggestion?.myRating || rating),
          }
        }),
      )
    } catch (error: any) {
      setNotice({ kind: "error", text: error?.message || "Unable to submit rating." })
    } finally {
      setRatingId(null)
    }
  }

  return {
    items,
    loading,
    saving,
    ratingId,
    search,
    setSearch,
    selectedCategory,
    setSelectedCategory,
    statusFilter,
    setStatusFilter,
    notice,
    formData,
    setFormData,
    handleSubmit,
    handleRateSuggestion,
  }
}
