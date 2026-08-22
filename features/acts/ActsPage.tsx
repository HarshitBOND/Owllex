"use client"

import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { Scale, Search } from "lucide-react"
import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { CategoryFilters } from "./components/CategoryFilters"
import { ActsResults } from "./components/ActsResults"
import { useActsData } from "./hooks/useActsData"

export default function ActsPage() {
  const { isOpen } = useSidebar()
  const { isLoaded, isSignedIn } = useUser()

  const {
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
  } = useActsData()

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
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search acts..."
                  className="pl-10 h-10"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6">
          <CategoryFilters
            availableCategories={availableCategories}
            activeCategory={activeCategory}
            search={search}
            onToggleCategory={toggleCategory}
            onClearFilters={clearFilters}
          />

          <ActsResults
            acts={acts}
            loading={loading}
            error={error}
            search={search}
            activeCategory={activeCategory}
            page={page}
            hasMore={hasMore}
            onRetry={retry}
            onPrevPage={() => setPage((p) => Math.max(0, p - 1))}
            onNextPage={() => setPage((p) => p + 1)}
          />
        </div>
      </div>
    </div>
  )
}
