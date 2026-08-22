import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { FraudReportItem, FraudStatus } from "../types"
import { formatAmount, formatDateTime, fraudStatusStyles } from "../utils"

interface FraudReportsPanelProps {
  fraudReports: FraudReportItem[]
  fraudStatusFilter: "all" | FraudStatus
  setFraudStatusFilter: (value: "all" | FraudStatus) => void
  fraudSearch: string
  setFraudSearch: (value: string) => void
  fraudLoading: boolean
  fraudUpdatingId: string | null
  fraudNotesById: Record<string, string>
  setFraudNotesById: (updater: (prev: Record<string, string>) => Record<string, string>) => void
  onRefresh: () => void
  onUpdateStatus: (reportId: string, status: FraudStatus) => void
}

export function FraudReportsPanel({
  fraudReports,
  fraudStatusFilter,
  setFraudStatusFilter,
  fraudSearch,
  setFraudSearch,
  fraudLoading,
  fraudUpdatingId,
  fraudNotesById,
  setFraudNotesById,
  onRefresh,
  onUpdateStatus,
}: FraudReportsPanelProps) {
  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Fraud Reports
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Track incident reviews, evidence, and resolution notes</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={fraudSearch}
              onChange={(event) => setFraudSearch(event.target.value)}
              placeholder="Search reports"
              className="w-48 h-9"
            />
            <select
              className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs"
              value={fraudStatusFilter}
              onChange={(event) => setFraudStatusFilter(event.target.value as "all" | FraudStatus)}
            >
              <option value="all">All statuses</option>
              <option value="new">New</option>
              <option value="under_review">Under Review</option>
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
            <Button variant="outline" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {fraudLoading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-sidebar-primary" />
          </div>
        ) : fraudReports.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No fraud reports found.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {fraudReports.map((item) => (
              <div key={item._id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm md:text-base">{item.incidentTitle}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {item.name} • {item.email} • {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                  <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border", fraudStatusStyles(item.status))}>
                    {item.status.replace("_", " ")}
                  </span>
                </div>

                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{item.incidentDetails}</p>

                <div className="grid md:grid-cols-3 gap-2 text-xs text-gray-500">
                  <p>Priority: <span className="font-medium text-gray-700 capitalize">{item.priority}</span></p>
                  <p>Case Ref: <span className="font-medium text-gray-700">{item.caseReference || "—"}</span></p>
                  <p>Amount: <span className="font-medium text-gray-700">{item.amountInvolved ? formatAmount(item.amountInvolved, "INR") : "—"}</span></p>
                </div>

                {item.evidenceUrls?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {item.evidenceUrls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-sidebar-primary underline"
                      >
                        Evidence file
                      </a>
                    ))}
                  </div>
                )}

                <div className="grid md:grid-cols-4 gap-2 items-start">
                  <select
                    value={item.status}
                    className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs"
                    onChange={(event) => onUpdateStatus(item._id, event.target.value as FraudStatus)}
                    disabled={fraudUpdatingId === item._id}
                  >
                    <option value="new">New</option>
                    <option value="under_review">Under Review</option>
                    <option value="investigating">Investigating</option>
                    <option value="resolved">Resolved</option>
                    <option value="dismissed">Dismissed</option>
                  </select>

                  <Input
                    value={fraudNotesById[item._id] || ""}
                    onChange={(event) =>
                      setFraudNotesById((prev) => ({ ...prev, [item._id]: event.target.value }))
                    }
                    placeholder="Resolution notes"
                    className="md:col-span-3 h-9"
                    disabled={fraudUpdatingId === item._id}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-xs text-gray-500 flex items-center gap-1">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Fraud-report workflow includes evidence links and case status tracking.
      </div>
    </>
  )
}
