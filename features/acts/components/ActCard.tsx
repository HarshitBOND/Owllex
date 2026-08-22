import { BookOpen, ExternalLink } from "lucide-react"
import type { Act } from "../types"

export function ActCard({ act }: { act: Act }) {
  return (
    <div className="bg-white dark:bg-card rounded-xl border-2 border-gray-200 dark:border-border p-4 hover:shadow-md dark:hover:shadow-none hover:border-gray-300 dark:hover:border-primary/30 transition-all group">
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
  )
}
