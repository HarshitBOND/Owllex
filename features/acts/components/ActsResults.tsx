import { AlertCircle, BookMarked, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Act } from "../types"
import { ActCard } from "./ActCard"

interface ActsResultsProps {
  acts: Act[]
  loading: boolean
  error: string | null
  search: string
  activeCategory: string
  page: number
  hasMore: boolean
  onRetry: () => void
  onPrevPage: () => void
  onNextPage: () => void
}

export function ActsResults({
  acts,
  loading,
  error,
  search,
  activeCategory,
  page,
  hasMore,
  onRetry,
  onPrevPage,
  onNextPage,
}: ActsResultsProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-sidebar-primary animate-spin mb-3" />
        <p className="text-sm text-gray-500 dark:text-muted-foreground">Loading acts...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
        <p className="text-sm text-gray-600 dark:text-muted-foreground mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    )
  }

  if (acts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <BookMarked className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-sm text-gray-500 dark:text-muted-foreground">
          {search ? `No acts found for "${search}"` : activeCategory ? `No acts found in ${activeCategory}` : "No acts available"}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {acts.map((act, idx) => (
          <ActCard key={act._id || idx} act={act} />
        ))}
      </div>

      <div className="flex items-center justify-center gap-4 mt-8">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={onPrevPage}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
        </Button>
        <span className="text-sm text-gray-500 dark:text-muted-foreground">Page {page + 1}</span>
        <Button variant="outline" size="sm" disabled={!hasMore} onClick={onNextPage}>
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </>
  )
}
