import { BellRing, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { IssueStatus, NotificationIssue } from "../types"
import { issueStatusStyles } from "../utils"

interface NotificationIssuesPanelProps {
  notificationIssues: NotificationIssue[]
  notificationIssueFilter: "all" | IssueStatus
  setNotificationIssueFilter: (value: "all" | IssueStatus) => void
  notificationSearch: string
  setNotificationSearch: (value: string) => void
  notificationLoading: boolean
  notificationUpdatingId: string | null
  notificationNotesById: Record<string, string>
  setNotificationNotesById: (updater: (prev: Record<string, string>) => Record<string, string>) => void
  onRefresh: () => void
  onRetry: (notificationId: string) => void
  onUpdateStatus: (notificationId: string, status: IssueStatus) => void
}

export function NotificationIssuesPanel({
  notificationIssues,
  notificationIssueFilter,
  setNotificationIssueFilter,
  notificationSearch,
  setNotificationSearch,
  notificationLoading,
  notificationUpdatingId,
  notificationNotesById,
  setNotificationNotesById,
  onRefresh,
  onRetry,
  onUpdateStatus,
}: NotificationIssuesPanelProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <BellRing className="h-4 w-4 text-orange-500" />
            Failed Notification Workflow
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">Retry or resolve failed email reminders</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={notificationSearch}
            onChange={(event) => setNotificationSearch(event.target.value)}
            placeholder="Search failed notifications"
            className="w-56 h-9"
          />
          <select
            className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs"
            value={notificationIssueFilter}
            onChange={(event) => setNotificationIssueFilter(event.target.value as "all" | IssueStatus)}
          >
            <option value="all">All issue statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
          <Button variant="outline" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {notificationLoading ? (
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
              <div className="grid md:grid-cols-5 gap-2">
                <Skeleton className="h-9 w-full rounded-md" />
                <Skeleton className="h-9 w-full rounded-md" />
                <Skeleton className="h-9 w-full rounded-md md:col-span-3" />
              </div>
            </div>
          ))}
        </div>
      ) : notificationIssues.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500">No failed notifications found.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {notificationIssues.map((item) => (
            <div key={item._id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900 text-sm md:text-base">{item.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {item.caseTitle || "Case reminder"} • {item.emailTo || "No target email"}
                  </p>
                </div>
                <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border", issueStatusStyles(item.supportIssueStatus))}>
                  {item.supportIssueStatus.replace("_", " ")}
                </span>
              </div>

              <p className="text-sm text-gray-700">{item.message}</p>
              <p className="text-xs text-red-600">Error: {item.error || "Unknown delivery error"}</p>

              <div className="grid md:grid-cols-5 gap-2 items-start">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRetry(item._id)}
                  disabled={notificationUpdatingId === item._id}
                >
                  Retry
                </Button>

                <select
                  value={item.supportIssueStatus}
                  className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs"
                  onChange={(event) =>
                    onUpdateStatus(item._id, event.target.value as IssueStatus)
                  }
                  disabled={notificationUpdatingId === item._id}
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>

                <Input
                  value={notificationNotesById[item._id] || ""}
                  onChange={(event) =>
                    setNotificationNotesById((prev) => ({ ...prev, [item._id]: event.target.value }))
                  }
                  placeholder="Issue notes"
                  className="md:col-span-3 h-9"
                  disabled={notificationUpdatingId === item._id}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
