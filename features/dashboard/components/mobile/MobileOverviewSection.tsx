import { AlertTriangle, ArrowRight, BarChart3, ChevronDown, Clock, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { DashboardData, StatCardDefinition } from "../../types"
import { formatMoney, quickActions } from "../../utils"

interface MobileOverviewSectionProps {
  statCards: StatCardDefinition[]
  loading: boolean
  data: DashboardData | null
  analytics: DashboardData["analytics"]
  billing: DashboardData["billing"]
  stats: DashboardData["stats"]
  hearingsExpanded: boolean
  onToggleHearings: () => void
  onNavigate: (href: string) => void
}

export function MobileOverviewSection({
  statCards,
  loading,
  data,
  analytics,
  billing,
  stats,
  hearingsExpanded,
  onToggleHearings,
  onNavigate,
}: MobileOverviewSectionProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {statCards.map((item) => (
          <button
            key={item.name}
            onClick={() => onNavigate(item.href)}
            className={cn(
              "bg-white dark:bg-card rounded-lg border p-3 shadow-sm text-left transition-all hover:shadow-md",
              item.borderColor
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className={cn("p-1.5 rounded-md", item.bgColor)}>
                <item.icon className={cn("h-4 w-4", item.color)} />
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-foreground">
                {loading ? "—" : item.value}
              </p>
            </div>
            <p className="text-xs font-medium text-gray-600 dark:text-muted-foreground">{item.name}</p>
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-card rounded-lg border border-violet-200 dark:border-violet-500/30 shadow-sm mb-4">
        <button onClick={onToggleHearings} className="w-full p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-violet-100 dark:bg-violet-500/10 rounded-md">
              <Clock className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-foreground">Upcoming Hearings</h3>
              <p className="text-xs text-gray-500 dark:text-muted-foreground">{stats.upcomingHearings} scheduled</p>
            </div>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-gray-400 dark:text-muted-foreground transition-transform", hearingsExpanded && "rotate-180")} />
        </button>
        {hearingsExpanded && (
          <div className="px-3 pb-3 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <LoaderCircle className="animate-spin text-gray-400 dark:text-muted-foreground" size={20} />
              </div>
            ) : data?.upcomingHearings && data.upcomingHearings.length > 0 ? (
              data.upcomingHearings.slice(0, 3).map((hearing: any, i: number) => (
                <div key={hearing._id || i} className="flex items-center gap-2 p-2 rounded-md bg-violet-50/50 dark:bg-violet-500/5 border border-violet-100 dark:border-violet-500/20" onClick={() => hearing._id && onNavigate(`/case-tracking/view/${hearing._id}`)}>
                  <div className="flex flex-col items-center bg-violet-100 dark:bg-violet-500/20 rounded px-2 py-1 min-w-[40px]">
                    <span className="text-[10px] font-medium text-violet-600 dark:text-violet-400">
                      {hearing.courtDate ? new Date(hearing.courtDate).toLocaleDateString("en-US", { month: "short" }) : "—"}
                    </span>
                    <span className="text-sm font-bold text-violet-700 dark:text-violet-300">
                      {hearing.courtDate ? new Date(hearing.courtDate).getDate() : "—"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-foreground truncate">{hearing.caseTitle || hearing.caseNo}</p>
                    <p className="text-[10px] text-gray-500 dark:text-muted-foreground truncate">{hearing.courtName || "Court not specified"}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-500 dark:text-muted-foreground text-center py-2">No upcoming hearings</p>
            )}
            <Button variant="ghost" size="sm" onClick={() => onNavigate("/case-tracking")} className="w-full text-xs h-8">
              View All Cases <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border shadow-sm mb-4">
        <div className="p-3 border-b border-gray-100 dark:border-border">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-foreground">Quick Actions</h3>
        </div>
        <div className="p-2 grid grid-cols-2 gap-2">
          {quickActions.slice(0, 4).map((item) => (
            <button
              key={item.name}
              onClick={() => onNavigate(item.href)}
              className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-100 dark:border-border hover:bg-gray-50 dark:hover:bg-muted text-left"
            >
              <span className={cn("p-1.5 rounded-md flex-shrink-0", item.color)}>
                <item.icon className="text-white" size={20} />
              </span>
              <span className="text-xs font-medium text-gray-900 dark:text-foreground truncate">{item.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => onNavigate("/tasks")}
          className="bg-white dark:bg-card rounded-lg border border-amber-200 dark:border-amber-500/30 p-3 text-left transition-all hover:shadow-md"
        >
          <div className="flex items-center justify-between mb-1">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="text-lg font-bold text-gray-900 dark:text-foreground">{analytics.overdueTasks}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-muted-foreground">Overdue Tasks</p>
        </button>
        <button
          onClick={() => onNavigate("/invoices")}
          className="bg-white dark:bg-card rounded-lg border border-blue-200 dark:border-sky-500/30 p-3 text-left transition-all hover:shadow-md"
        >
          <div className="flex items-center justify-between mb-1">
            <BarChart3 className="h-4 w-4 text-blue-600 dark:text-sky-400" />
            <span className="text-sm font-bold text-gray-900 dark:text-foreground">{formatMoney(billing.totalOutstanding)}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-muted-foreground">Outstanding</p>
        </button>
      </div>
    </>
  )
}
