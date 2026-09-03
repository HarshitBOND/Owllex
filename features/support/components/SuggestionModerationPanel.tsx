import { Loader2, RefreshCw, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { SuggestionModerationItem, SuggestionStatus } from "../types"
import { suggestionStatusStyles } from "../utils"

interface SuggestionModerationPanelProps {
  suggestions: SuggestionModerationItem[]
  suggestionStatusFilter: "all" | SuggestionStatus
  setSuggestionStatusFilter: (value: "all" | SuggestionStatus) => void
  suggestionSearch: string
  setSuggestionSearch: (value: string) => void
  suggestionLoading: boolean
  suggestionUpdatingId: string | null
  suggestionNotesById: Record<string, string>
  setSuggestionNotesById: (updater: (prev: Record<string, string>) => Record<string, string>) => void
  onRefresh: () => void
  onUpdateStatus: (suggestionId: string, status: SuggestionStatus) => void
}

export function SuggestionModerationPanel({
  suggestions,
  suggestionStatusFilter,
  setSuggestionStatusFilter,
  suggestionSearch,
  setSuggestionSearch,
  suggestionLoading,
  suggestionUpdatingId,
  suggestionNotesById,
  setSuggestionNotesById,
  onRefresh,
  onUpdateStatus,
}: SuggestionModerationPanelProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Suggestion Moderation
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">Approve or reject product suggestions from users</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={suggestionSearch}
            onChange={(event) => setSuggestionSearch(event.target.value)}
            placeholder="Search suggestions"
            className="w-48 h-9"
          />
          <select
            className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs"
            value={suggestionStatusFilter}
            onChange={(event) => setSuggestionStatusFilter(event.target.value as "all" | SuggestionStatus)}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <Button variant="outline" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {suggestionLoading ? (
        <div className="divide-y divide-gray-100">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-52" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-40" />
              <div className="grid md:grid-cols-4 gap-2">
                <Skeleton className="h-9 w-full rounded-md" />
                <Skeleton className="h-9 w-full rounded-md md:col-span-3" />
              </div>
            </div>
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500">No suggestions found for the selected filters.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {suggestions.map((item) => (
            <div key={item._id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900 text-sm md:text-base">{item.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {item.submitterName} • {item.submitterEmail || "No email"} • {item.category}
                  </p>
                </div>
                <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border", suggestionStatusStyles(item.status))}>
                  {item.status}
                </span>
              </div>

              <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{item.description}</p>
              <p className="text-xs text-gray-500">
                Rating: {item.ratingAverage.toFixed(1)} ({item.ratingCount} total)
              </p>

              <div className="grid md:grid-cols-4 gap-2 items-start">
                <select
                  value={item.status}
                  className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs"
                  onChange={(event) => onUpdateStatus(item._id, event.target.value as SuggestionStatus)}
                  disabled={suggestionUpdatingId === item._id}
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>

                <Input
                  value={suggestionNotesById[item._id] || ""}
                  onChange={(event) =>
                    setSuggestionNotesById((prev) => ({ ...prev, [item._id]: event.target.value }))
                  }
                  placeholder="Moderation note"
                  className="md:col-span-3 h-9"
                  disabled={suggestionUpdatingId === item._id}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
