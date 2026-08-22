import { CheckCircle2, CircleAlert } from "lucide-react"
import type { FormStatus } from "../types"

interface FraudReportNoticeProps {
  status: FormStatus
  errorMessage: string
}

export function FraudReportNotice({ status, errorMessage }: FraudReportNoticeProps) {
  if (status === "success") {
    return (
      <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4" />
        Fraud report submitted successfully. Support will review it shortly.
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
        <CircleAlert className="h-4 w-4" />
        {errorMessage || "Unable to submit fraud report"}
      </div>
    )
  }

  return null
}
