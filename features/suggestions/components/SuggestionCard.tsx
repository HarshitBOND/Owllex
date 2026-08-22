import { ArrowRight, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SuggestionItem } from "../types"
import { getStatusStyle } from "../utils"

interface SuggestionCardProps {
  suggestion: SuggestionItem
  ratingId: string | null
  onRate: (suggestionId: string, rating: number) => void
}

export function SuggestionCard({ suggestion, ratingId, onRate }: SuggestionCardProps) {
  return (
    <div className="bg-white dark:bg-card rounded-xl border-2 border-gray-200 dark:border-border shadow-sm hover:shadow-md dark:shadow-none transition-all duration-300 p-5 group">
      <div className="flex items-start justify-between mb-3 gap-2">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-foreground mb-1 leading-snug">{suggestion.title}</h3>
          <p className="text-xs text-gray-400 dark:text-muted-foreground">{suggestion.category}</p>
        </div>
        <span className={cn("inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold", getStatusStyle(suggestion.status))}>
          {suggestion.status.replace("_", " ")}
        </span>
      </div>

      <p className="text-sm text-gray-600 dark:text-muted-foreground mb-4 line-clamp-4">{suggestion.description}</p>

      {suggestion.isMine && suggestion.adminNotes ? (
        <div className="mb-3 rounded-md border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted px-3 py-2">
          <p className="text-[11px] font-medium text-gray-700 dark:text-foreground">Admin note</p>
          <p className="text-xs text-gray-600 dark:text-muted-foreground mt-0.5">{suggestion.adminNotes}</p>
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
                onClick={() => onRate(suggestion._id, value)}
                className={cn(
                  "p-0.5 rounded transition-opacity",
                  suggestion.status === "approved" ? "hover:opacity-80" : "opacity-40 cursor-not-allowed",
                )}
                title={suggestion.status === "approved" ? `Rate ${value} star` : "Only approved suggestions can be rated"}
              >
                <Star
                  className={cn(
                    "h-4 w-4",
                    active ? "fill-amber-400 text-amber-400" : "text-gray-300 dark:text-gray-600",
                  )}
                />
              </button>
            )
          })}
        </div>

        <div className="text-xs text-gray-500 dark:text-muted-foreground flex items-center gap-1">
          <span>{suggestion.ratingAverage.toFixed(1)}</span>
          <span>·</span>
          <span>{suggestion.ratingCount} rating{suggestion.ratingCount === 1 ? "" : "s"}</span>
          <ArrowRight className="h-3.5 w-3.5 text-gray-400 dark:text-muted-foreground" />
        </div>
      </div>
    </div>
  )
}
