import { CheckCircle2, CreditCard, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { BillingIssue, IssueStatus } from "../types"
import { formatAmount, formatDateTime, issueStatusStyles } from "../utils"

interface BillingIssuesPanelProps {
  billingIssues: BillingIssue[]
  billingIssueFilter: "all" | IssueStatus
  setBillingIssueFilter: (value: "all" | IssueStatus) => void
  billingSearch: string
  setBillingSearch: (value: string) => void
  billingLoading: boolean
  billingUpdatingId: string | null
  billingNotesById: Record<string, string>
  setBillingNotesById: (updater: (prev: Record<string, string>) => Record<string, string>) => void
  onRefresh: () => void
  onUpdateStatus: (transactionId: string, status: IssueStatus) => void
}

export function BillingIssuesPanel({
  billingIssues,
  billingIssueFilter,
  setBillingIssueFilter,
  billingSearch,
  setBillingSearch,
  billingLoading,
  billingUpdatingId,
  billingNotesById,
  setBillingNotesById,
  onRefresh,
  onUpdateStatus,
}: BillingIssuesPanelProps) {
  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-violet-500" />
              Billing Issue Workflow
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Review failed/pending transaction issues</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={billingSearch}
              onChange={(event) => setBillingSearch(event.target.value)}
              placeholder="Search billing issues"
              className="w-56 h-9"
            />
            <select
              className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs"
              value={billingIssueFilter}
              onChange={(event) => setBillingIssueFilter(event.target.value as "all" | IssueStatus)}
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

        {billingLoading ? (
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-5 w-20 rounded-full" />
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
        ) : billingIssues.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No billing issues found.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {billingIssues.map((item) => (
              <div key={item._id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm md:text-base">
                      {formatAmount(item.amount, item.currency || "INR")} • {item.paymentGateway}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {item.gatewayTransactionId || item.checkoutSessionId || "No gateway id"} • {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                  <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border", issueStatusStyles(item.supportIssueStatus))}>
                    {item.supportIssueStatus.replace("_", " ")}
                  </span>
                </div>

                <p className="text-sm text-gray-700">{item.description || "No description"}</p>
                <p className="text-xs text-red-600">Failure reason: {item.failureReason || "N/A"}</p>

                <div className="grid md:grid-cols-4 gap-2 items-start">
                  <select
                    value={item.supportIssueStatus}
                    className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs"
                    onChange={(event) =>
                      onUpdateStatus(item._id, event.target.value as IssueStatus)
                    }
                    disabled={billingUpdatingId === item._id}
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </select>

                  <Input
                    value={billingNotesById[item._id] || ""}
                    onChange={(event) =>
                      setBillingNotesById((prev) => ({ ...prev, [item._id]: event.target.value }))
                    }
                    placeholder="Issue notes"
                    className="md:col-span-3 h-9"
                    disabled={billingUpdatingId === item._id}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-xs text-gray-500 flex items-center gap-1">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Support workflows now cover contact, fraud, failed notifications, billing issues, and suggestions moderation.
      </div>
    </>
  )
}
