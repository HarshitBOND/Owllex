import { useCallback, useEffect, useState } from "react"
import type { Act, ActsResponse } from "../types"
import { PAGE_SIZE, defaultCategories } from "../utils"

export function useActsData() {
  const [acts, setActs] = useState<Act[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState("")
  const [availableCategories, setAvailableCategories] = useState<string[]>(defaultCategories)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  const fetchActs = useCallback(async (skip: number, query: string, category: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        skip: String(skip),
        limit: String(PAGE_SIZE),
      })

      if (query) {
        params.set("search", query)
      }

      if (category) {
        params.set("category", category)
      }

      const res = await fetch(`/api/public/acts?${params.toString()}`)
      if (!res.ok) throw new Error("Failed to fetch")
      const data = (await res.json()) as ActsResponse
      const items = Array.isArray(data) ? data : data.acts || data.data || []
      setActs(items)
      setHasMore(typeof data.hasMore === "boolean" ? data.hasMore : items.length === PAGE_SIZE)

      if (Array.isArray(data.availableCategories) && data.availableCategories.length > 0) {
        setAvailableCategories(data.availableCategories)
      }
    } catch {
      setError("Unable to load acts. Please try again.")
      setActs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setPage(0)
  }, [search, activeCategory])

  useEffect(() => {
    fetchActs(page * PAGE_SIZE, search.trim(), activeCategory)
  }, [page, search, activeCategory, fetchActs])

  const retry = () => fetchActs(page * PAGE_SIZE, search.trim(), activeCategory)

  const toggleCategory = (tag: string) => {
    setActiveCategory((current) => (current === tag ? "" : tag))
  }

  const clearFilters = () => {
    setSearch("")
    setActiveCategory("")
  }

  return {
    acts,
    loading,
    error,
    search,
    setSearch,
    activeCategory,
    availableCategories,
    page,
    setPage,
    hasMore,
    retry,
    toggleCategory,
    clearFilters,
  }
}
