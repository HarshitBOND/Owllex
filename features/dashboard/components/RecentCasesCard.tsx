import { Briefcase, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

interface RecentCasesCardProps {
  cases: any[]
  limit: number
  compact?: boolean
  showViewAll?: boolean
  onNavigate: (href: string) => void
}

export function RecentCasesCard({ cases, limit, compact, showViewAll, onNavigate }: RecentCasesCardProps) {
  return (
    <div className="bg-white dark:bg-card rounded-lg lg:rounded-xl border border-gray-200 dark:border-border shadow-sm">
      <div className={compact ? "p-3 border-b border-gray-100 dark:border-border" : "p-4 border-b border-gray-100 dark:border-border flex items-center justify-between"}>
        <h3 className={compact ? "text-sm font-semibold text-gray-900 dark:text-foreground flex items-center gap-2" : "text-lg font-semibold text-gray-900 dark:text-foreground flex items-center gap-2"}>
          <Briefcase className={compact ? "h-4 w-4 text-blue-600 dark:text-sky-400" : "h-5 w-5 text-blue-600 dark:text-sky-400"} />
          Recent Cases
        </h3>
        {showViewAll && (
          <Button variant="ghost" size="sm" onClick={() => onNavigate("/case-tracking")} className="text-sidebar-primary hover:text-sidebar-primary/80">
            View All <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </div>
      <div className="divide-y divide-gray-100 dark:divide-border">
        {cases.slice(0, limit).map((c: any, i: number) =>
          compact ? (
            <div key={c._id || i} className="p-3" onClick={() => onNavigate(`/case-tracking/view/${c._id}`)}>
              <p className="text-xs font-medium text-gray-900 dark:text-foreground truncate">{c.caseTitle || c.caseNo}</p>
              <p className="text-[10px] text-gray-500 dark:text-muted-foreground">{c.courtName || "N/A"}</p>
            </div>
          ) : (
            <div key={c._id || i} className="p-4 hover:bg-gray-50 dark:hover:bg-muted transition-colors cursor-pointer" onClick={() => onNavigate(`/case-tracking/view/${c._id}`)}>
              <p className="font-medium text-sm text-gray-900 dark:text-foreground truncate">{c.caseTitle || c.caseNo}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-gray-500 dark:text-muted-foreground">{c.caseNo}</span>
                <span className="text-xs text-gray-400 dark:text-muted-foreground">|</span>
                <span className="text-xs text-gray-500 dark:text-muted-foreground">{c.courtName || "N/A"}</span>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}
