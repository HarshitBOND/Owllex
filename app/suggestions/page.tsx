"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  WandSparkles,
  Search,
  ArrowRight,
  Loader2,
  Star,
  Send,
  CircleAlert,
  CheckCircle2,
} from "lucide-react"

type SuggestionStatus = "pending" | "approved" | "rejected"

interface SuggestionItem {
  _id: string
  title: string
  description: string
  category: string
  status: SuggestionStatus
  adminNotes: string
  ratingAverage: number
  ratingCount: number
  myRating: number | null
  isMine: boolean
  createdAt: string
}

const categories = [
  "All",
  "Case Strategy",
  "Client Management",
  "Practice Management",
  "Legal Research",
  "Compliance",
  "Automation",
  "General",
]

const statusFilters: Array<{ label: string; value: "all" | SuggestionStatus }> = [
  { label: "All", value: "all" },
  { label: "Approved", value: "approved" },
  { label: "My Pending", value: "pending" },
  { label: "My Rejected", value: "rejected" },
]

function getStatusStyle(status: SuggestionStatus) {
  if (status === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (status === "rejected") return "bg-red-50 text-red-700 border-red-200"
  return "bg-amber-50 text-amber-700 border-amber-200"
}

const Suggestions = () => {
  const { isOpen } = useSidebar()
  const { isLoaded, isSignedIn } = useUser()
  const [items, setItems] = useState<SuggestionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [ratingId, setRatingId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [statusFilter, setStatusFilter] = useState<"all" | SuggestionStatus>("all")
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null)
  const [formData, setFormData] = useState({
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

  const visibleItems = useMemo(() => {
    return items
  }, [items])

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F3F5F9]">
        <Loader2 className="h-8 w-8 animate-spin text-sidebar-primary" />
      </div>
    )
  }
  if (!isSignedIn) {
    return redirect("/")
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className={cn("bg-[#F3F5F9] min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0", isOpen ? "lg:ml-48" : "lg:ml-12")}>
        <div className="bg-white border-b border-gray-200 w-full">
          <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
            <Navbar location="Suggestions" />
            <div className="mb-2">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-amber-50 rounded-lg">
                  <WandSparkles className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Smart Suggestions</h2>
                  <p className="text-sm text-gray-500">Submit ideas, track moderation, and rate approved suggestions</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Send className="h-4 w-4 text-sidebar-primary" />
              <p className="font-semibold text-gray-900">Submit a new suggestion</p>
            </div>
            <p className="text-sm text-gray-500 mb-4">Suggestions are reviewed by support/admin before being publicly visible.</p>

            {notice?.kind === "success" && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {notice.text}
              </div>
            )}

            {notice?.kind === "error" && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                <CircleAlert className="h-4 w-4" />
                {notice.text}
              </div>
            )}

            <form className="space-y-3" onSubmit={handleSubmit}>
              <div className="grid md:grid-cols-3 gap-3">
                <Input
                  value={formData.title}
                  onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Suggestion title"
                  className="md:col-span-2"
                  maxLength={180}
                  required
                />
                <select
                  value={formData.category}
                  onChange={(event) => setFormData((prev) => ({ ...prev, category: event.target.value }))}
                  className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
                >
                  {categories.filter((cat) => cat !== "All").map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <Textarea
                value={formData.description}
                onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Describe the workflow problem and what should improve"
                rows={4}
                maxLength={5000}
                required
              />

              <div className="flex justify-end">
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Submit Suggestion
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search suggestions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-white h-11"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                    selectedCategory === cat
                      ? "bg-sidebar-primary text-white"
                      : "bg-white text-gray-600 border-2 border-gray-200 hover:bg-gray-50"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            {statusFilters.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setStatusFilter(item.value)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                  statusFilter === item.value
                    ? "bg-sidebar-primary text-white border-sidebar-primary"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Suggestions Grid */}
          {loading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-sidebar-primary animate-spin" />
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleItems.map((suggestion) => (
                <div
                  key={suggestion._id}
                  className="bg-white rounded-xl border-2 border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 p-5 group"
                >
                  <div className="flex items-start justify-between mb-3 gap-2">
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1 leading-snug">{suggestion.title}</h3>
                      <p className="text-xs text-gray-400">{suggestion.category}</p>
                    </div>
                    <span className={cn("inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold", getStatusStyle(suggestion.status))}>
                      {suggestion.status.replace("_", " ")}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 mb-4 line-clamp-4">{suggestion.description}</p>

                  {suggestion.isMine && suggestion.adminNotes ? (
                    <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                      <p className="text-[11px] font-medium text-gray-700">Admin note</p>
                      <p className="text-xs text-gray-600 mt-0.5">{suggestion.adminNotes}</p>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((value) => {
                        const active = Number(suggestion.myRating || 0) >= value
                        return (
                          <button
                            key={value}
                            type="button"
                            disabled={suggestion.status !== "approved" || ratingId === suggestion._id}
                            onClick={() => handleRateSuggestion(suggestion._id, value)}
                            className={cn(
                              "p-0.5 rounded transition-opacity",
                              suggestion.status === "approved" ? "hover:opacity-80" : "opacity-40 cursor-not-allowed",
                            )}
                            title={suggestion.status === "approved" ? `Rate ${value} star` : "Only approved suggestions can be rated"}
                          >
                            <Star
                              className={cn(
                                "h-4 w-4",
                                active ? "fill-amber-400 text-amber-400" : "text-gray-300",
                              )}
                            />
                          </button>
                        )
                      })}
                    </div>

                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <span>{suggestion.ratingAverage.toFixed(1)}</span>
                      <span>·</span>
                      <span>{suggestion.ratingCount} rating{suggestion.ratingCount === 1 ? "" : "s"}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && visibleItems.length === 0 && (
            <div className="text-center py-16">
              <WandSparkles className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-600">No suggestions found</h3>
              <p className="text-sm text-gray-400 mt-1">Try adjusting your search or filter</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
export default Suggestions