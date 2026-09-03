import { CheckCircle2, Clock3, Loader2, RefreshCw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { SupportCounts, SupportMessageItem, SupportStatus } from "../types"
import { formatDateTime, statusStyles } from "../utils"

interface SupportMessagesPanelProps {
  messages: SupportMessageItem[]
  counts: SupportCounts
  statusFilter: "all" | SupportStatus
  setStatusFilter: (value: "all" | SupportStatus) => void
  search: string
  setSearch: (value: string) => void
  page: number
  setPage: (updater: (prev: number) => number) => void
  totalPages: number
  loading: boolean
  updatingId: string | null
  onSearch: () => void
  onUpdateStatus: (messageId: string, status: SupportStatus) => void
}

export function SupportMessagesPanel({
  messages,
  statusFilter,
  setStatusFilter,
  search,
  setSearch,
  page,
  setPage,
  totalPages,
  loading,
  updatingId,
  onSearch,
  onUpdateStatus,
}: SupportMessagesPanelProps) {
  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => {
                setPage(() => 1)
                setSearch(e.target.value)
              }}
              placeholder="Search by name, email, subject, or message"
              className="pl-9"
            />
          </div>

          <div className="flex gap-2">
            <select
              className="flex-1 h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
              value={statusFilter}
              onChange={(e) => {
                setPage(() => 1)
                setStatusFilter(e.target.value as "all" | SupportStatus)
              }}
            >
              <option value="all">All statuses</option>
              <option value="new">New</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
            <Button variant="outline" onClick={onSearch}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Incoming Contact Requests</h3>
          <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
        </div>

        {loading ? (
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full" />
                <div className="flex items-center justify-between gap-3 pt-1">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-9 w-28 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="p-8 text-center">
            <Clock3 className="h-7 w-7 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-600">No messages found</p>
            <p className="text-xs text-gray-400 mt-1">Try adjusting search or status filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {messages.map((item) => (
              <div key={item._id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm md:text-base">{item.subject}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {item.name} • {item.email} • {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                  <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border", statusStyles(item.status))}>
                    {item.status.replace("_", " ")}
                  </span>
                </div>

                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{item.message}</p>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <p className="text-xs text-gray-400">
                    Last update: {formatDateTime(item.updatedAt)}
                  </p>

                  <div className="flex items-center gap-2">
                    <select
                      value={item.status}
                      className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs"
                      onChange={(e) => onUpdateStatus(item._id, e.target.value as SupportStatus)}
                      disabled={updatingId === item._id}
                    >
                      <option value="new">New</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                    </select>
                    {updatingId === item._id && (
                      <Loader2 className="h-4 w-4 animate-spin text-sidebar-primary" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1 || loading}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page >= totalPages || loading}
          >
            Next
          </Button>
        </div>
      </div>

      <div className="text-xs text-gray-500 flex items-center gap-1">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Contact workflow with status tracking.
      </div>
    </>
  )
}
