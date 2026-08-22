import { Loader2, WandSparkles } from "lucide-react"
import type { SuggestionItem } from "../types"
import { SuggestionCard } from "./SuggestionCard"

interface SuggestionsGridProps {
  loading: boolean
  items: SuggestionItem[]
  ratingId: string | null
  onRate: (suggestionId: string, rating: number) => void
}

export function SuggestionsGrid({ loading, items, ratingId, onRate }: SuggestionsGridProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-border p-10 flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-sidebar-primary animate-spin" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <WandSparkles className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-600">No suggestions found</h3>
        <p className="text-sm text-gray-400 mt-1">Try adjusting your search or filter</p>
      </div>
    )
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((suggestion) => (
        <SuggestionCard key={suggestion._id} suggestion={suggestion} ratingId={ratingId} onRate={onRate} />
      ))}
    </div>
  )
}
