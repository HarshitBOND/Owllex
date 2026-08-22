import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { SuggestionStatus } from "../types"
import { categories, statusFilters } from "../utils"

interface SuggestionFiltersProps {
  search: string
  setSearch: (value: string) => void
  selectedCategory: string
  setSelectedCategory: (value: string) => void
  statusFilter: "all" | SuggestionStatus
  setStatusFilter: (value: "all" | SuggestionStatus) => void
}

export function SuggestionFilters({
  search,
  setSearch,
  selectedCategory,
  setSelectedCategory,
  statusFilter,
  setStatusFilter,
}: SuggestionFiltersProps) {
  return (
    <>
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-muted-foreground" />
          <Input
            placeholder="Search suggestions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-white dark:bg-card h-11"
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
                  : "bg-white dark:bg-card text-gray-600 dark:text-foreground border-2 border-gray-200 dark:border-border hover:bg-gray-50 dark:hover:bg-muted"
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
                : "bg-white dark:bg-card text-gray-600 dark:text-foreground border-gray-200 dark:border-border hover:bg-gray-50 dark:hover:bg-muted",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}
