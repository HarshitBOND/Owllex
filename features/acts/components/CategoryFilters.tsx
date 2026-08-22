import { cn } from "@/lib/utils"

interface CategoryFiltersProps {
  availableCategories: string[]
  activeCategory: string
  search: string
  onToggleCategory: (tag: string) => void
  onClearFilters: () => void
}

export function CategoryFilters({
  availableCategories,
  activeCategory,
  search,
  onToggleCategory,
  onClearFilters,
}: CategoryFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2 mb-5">
      {availableCategories.map((tag) => (
        <button
          key={tag}
          onClick={() => onToggleCategory(tag)}
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
          onClick={onClearFilters}
          className="px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30 hover:bg-red-100 dark:hover:bg-red-500/20 cursor-pointer"
        >
          Clear Filter
        </button>
      )}
    </div>
  )
}
