"use client"

import { useEffect, useState, useCallback } from "react"
import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Search, BookOpen, ExternalLink, ChevronLeft, ChevronRight,
  Scale, Filter, Loader2, AlertCircle, BookMarked
} from "lucide-react"

type Act = {
  _id: string
  actName: string
  actYear?: string
  actNo?: string
  category?: string
  url?: string
}

type ActsResponse = {
  success?: boolean
  acts?: Act[]
  data?: Act[]
  hasMore?: boolean
  availableCategories?: string[]
}

const PAGE_SIZE = 30

const Acts = () => {
  const { isOpen } = useSidebar()
  const { isLoaded, isSignedIn } = useUser()
  const [acts, setActs] = useState<Act[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState("")
  const [availableCategories, setAvailableCategories] = useState<string[]>([
    "Criminal",
    "Civil",
    "Evidence",
    "Constitution",
    "Commercial",
    "Property",
    "Corporate",
    "Tax",
  ])
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

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F3F5F9] dark:bg-background">
        <div className="w-12 h-12 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
      </div>
    )
  }
  if (!isSignedIn) return redirect("/")

  return (
    <div className="flex">
      <Sidebar />
      <div className={cn("bg-[#F3F5F9] dark:bg-background min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0", isOpen ? "lg:ml-48" : "lg:ml-12")}>
        {/* Header */}
        <div className="bg-white dark:bg-card border-b border-gray-200 dark:border-border w-full">
          <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
            <Navbar location="Acts & Statutes" />
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg">
                  <Scale className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-foreground">Acts & Statutes</h2>
                  <p className="text-sm text-gray-500 dark:text-muted-foreground">Browse Indian bare acts and legislation</p>
                </div>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search acts..."
                  className="pl-10 h-10"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6">
          {/* Quick Category Tags */}
          <div className="flex flex-wrap gap-2 mb-5">
            {availableCategories.map(tag => (
              <button
                key={tag}
                onClick={() => setActiveCategory(current => current === tag ? "" : tag)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer",
                  activeCategory === tag
                    ? "bg-sidebar-primary text-white border-sidebar-primary"
                    : "bg-white dark:bg-card text-gray-600 dark:text-foreground border-gray-200 dark:border-border hover:border-gray-300 dark:hover:border-border hover:bg-gray-50 dark:hover:bg-muted"
                )}
              >
                {tag}
              </button>
            ))}
            {(search || activeCategory) && (
              <button
                onClick={() => {
                  setSearch("")
                  setActiveCategory("")
                }}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30 hover:bg-red-100 dark:hover:bg-red-500/20 cursor-pointer"
              >
                Clear Filter
              </button>
            )}
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-8 w-8 text-sidebar-primary animate-spin mb-3" />
              <p className="text-sm text-gray-500 dark:text-muted-foreground">Loading acts...</p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
              <p className="text-sm text-gray-600 dark:text-muted-foreground mb-3">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchActs(page * PAGE_SIZE, search.trim(), activeCategory)}
              >
                Retry
              </Button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && acts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <BookMarked className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-500 dark:text-muted-foreground">
                {search ? `No acts found for "${search}"` : activeCategory ? `No acts found in ${activeCategory}` : "No acts available"}
              </p>
            </div>
          )}

          {/* Acts Grid */}
          {!loading && !error && acts.length > 0 && (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {acts.map((act, idx) => (
                  <div
                    key={act._id || idx}
                    className="bg-white dark:bg-card rounded-xl border-2 border-gray-200 dark:border-border p-4 hover:shadow-md dark:hover:shadow-none hover:border-gray-300 dark:hover:border-primary/30 transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg flex-shrink-0 mt-0.5">
                        <BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-foreground line-clamp-2 group-hover:text-sidebar-primary transition-colors">
                          {act.actName}
                        </h3>
                        {act.actYear && (
                          <p className="text-xs text-gray-400 dark:text-muted-foreground mt-1">Year: {act.actYear}</p>
                        )}
                        {act.actNo && (
                          <p className="text-xs text-gray-400 dark:text-muted-foreground">Act No: {act.actNo}</p>
                        )}
                      </div>
                    </div>
                    {act.url && (
                      <a
                        href={act.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 flex items-center text-xs text-sidebar-primary font-medium hover:underline"
                      >
                        Read Full Act <ExternalLink className="h-3 w-3 ml-1" />
                      </a>
                    )}
                  </div>
                ))}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-center gap-4 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <span className="text-sm text-gray-500 dark:text-muted-foreground">Page {page + 1}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasMore}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
export default Acts
