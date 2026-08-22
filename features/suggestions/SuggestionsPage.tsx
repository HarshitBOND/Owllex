"use client"

import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { Loader2, WandSparkles } from "lucide-react"
import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { SuggestionForm } from "./components/SuggestionForm"
import { SuggestionFilters } from "./components/SuggestionFilters"
import { SuggestionsGrid } from "./components/SuggestionsGrid"
import { useSuggestionsData } from "./hooks/useSuggestionsData"

export default function SuggestionsPage() {
  const { isOpen } = useSidebar()
  const { isLoaded, isSignedIn } = useUser()

  const {
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
  } = useSuggestionsData(isSignedIn)

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F3F5F9] dark:bg-background">
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
      <div className={cn("bg-[#F3F5F9] dark:bg-background min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0", isOpen ? "lg:ml-48" : "lg:ml-12")}>
        <div className="bg-white dark:bg-card border-b border-gray-200 dark:border-border w-full">
          <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
            <Navbar location="Suggestions" />
            <div className="mb-2">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-amber-50 dark:bg-amber-500/10 rounded-lg">
                  <WandSparkles className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-foreground">Smart Suggestions</h2>
                  <p className="text-sm text-gray-500 dark:text-muted-foreground">Submit ideas, track moderation, and rate approved suggestions</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-6">
          <SuggestionForm
            formData={formData}
            setFormData={setFormData}
            notice={notice}
            saving={saving}
            onSubmit={handleSubmit}
          />

          <SuggestionFilters
            search={search}
            setSearch={setSearch}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
          />

          <SuggestionsGrid loading={loading} items={items} ratingId={ratingId} onRate={handleRateSuggestion} />
        </div>
      </div>
    </div>
  )
}
