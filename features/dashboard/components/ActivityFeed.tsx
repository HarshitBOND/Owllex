import { cn } from "@/lib/utils"

interface ActivityFeedProps {
  activityFeed: any[]
  limit: number
  compact?: boolean
  onNavigate: (href: string) => void
}

export function ActivityFeed({ activityFeed, limit, compact, onNavigate }: ActivityFeedProps) {
  if (activityFeed.length === 0) {
    return (
      <div className={cn(compact ? "p-4 text-xs" : "p-6 text-sm", "text-gray-500 dark:text-muted-foreground text-center")}>
        No recent activity{compact ? "" : " yet"}
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-border">
      {activityFeed.slice(0, limit).map((item: any, index: number) => (
        <div
          key={`${item.type}-${index}`}
          className={cn(
            compact ? "p-3" : "p-4 transition-colors cursor-pointer",
            "hover:bg-gray-50 dark:hover:bg-muted",
          )}
          onClick={() => item.href && onNavigate(item.href)}
        >
          <div className={cn("flex items-start justify-between gap-3", compact && "items-center")}>
            <div className="min-w-0">
              <p className={cn(compact ? "text-xs" : "text-sm", "font-medium text-gray-900 dark:text-foreground truncate")}>{item.title}</p>
              <p className={cn(compact ? "text-[10px]" : "text-xs mt-0.5", "text-gray-500 dark:text-muted-foreground truncate")}>{item.subtitle}</p>
            </div>
            <span className={cn(compact ? "text-[10px]" : "text-[11px]", "text-gray-400 dark:text-muted-foreground whitespace-nowrap")}>
              {item.at ? new Date(item.at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
