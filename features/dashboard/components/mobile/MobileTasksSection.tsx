import { CheckSquare, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { DashboardData } from "../../types"

interface MobileTasksSectionProps {
  loading: boolean
  data: DashboardData | null
  analytics: DashboardData["analytics"]
  onNavigate: (href: string) => void
}

export function MobileTasksSection({ loading, data, analytics, onNavigate }: MobileTasksSectionProps) {
  return (
    <>
      <div className="bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border shadow-sm mb-4">
        <div className="p-3 border-b border-gray-100 dark:border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-foreground flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            Pending Tasks
          </h3>
          <Button variant="ghost" size="sm" onClick={() => onNavigate("/tasks")} className="text-xs h-7 px-2">
            View All
          </Button>
        </div>
        <div className="p-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <LoaderCircle className="animate-spin text-gray-400 dark:text-muted-foreground" size={20} />
            </div>
          ) : data?.recentTasks && data.recentTasks.length > 0 ? (
            data.recentTasks.slice(0, 6).map((task: any, i: number) => (
              <div key={task._id || i} className="flex items-center gap-2 p-2 rounded-md bg-gray-50 dark:bg-muted">
                <div className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  task.dueDate && new Date(task.dueDate) < new Date() ? "bg-red-500" : "bg-orange-400"
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 dark:text-foreground truncate">{task.task}</p>
                  <p className="text-[10px] text-gray-500 dark:text-muted-foreground">
                    Due: {task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No date"}
                  </p>
                </div>
                {task.dueDate && new Date(task.dueDate) < new Date() && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-medium">Overdue</span>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-4">
              <p className="text-xs text-gray-500 dark:text-muted-foreground">No pending tasks</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white dark:bg-card rounded-lg border dark:border-border p-3">
          <p className="text-xs text-gray-500 dark:text-muted-foreground">Tasks Due (7 days)</p>
          <p className="text-xl font-bold text-gray-900 dark:text-foreground">{analytics.tasksDueNext7Days}</p>
        </div>
        <div className="bg-white dark:bg-card rounded-lg border border-red-200 dark:border-red-500/30 p-3">
          <p className="text-xs text-gray-500 dark:text-muted-foreground">Overdue</p>
          <p className="text-xl font-bold text-red-600 dark:text-red-400">{analytics.overdueTasks}</p>
        </div>
      </div>
    </>
  )
}
