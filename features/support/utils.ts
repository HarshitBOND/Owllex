import type {
  BillingIssueCounts,
  FraudCounts,
  FraudStatus,
  IssueStatus,
  SuggestionCounts,
  SuggestionStatus,
  SupportCounts,
  SupportStatus,
  NotificationIssueCounts,
} from "./types"

export const defaultCounts: SupportCounts = {
  new: 0,
  in_progress: 0,
  resolved: 0,
  total: 0,
}

export const defaultFraudCounts: FraudCounts = {
  new: 0,
  under_review: 0,
  investigating: 0,
  resolved: 0,
  dismissed: 0,
  total: 0,
}

export const defaultSuggestionCounts: SuggestionCounts = {
  pending: 0,
  approved: 0,
  rejected: 0,
  total: 0,
}

export const defaultIssueCounts: NotificationIssueCounts = {
  open: 0,
  in_progress: 0,
  resolved: 0,
  total: 0,
}

export const defaultBillingCounts: BillingIssueCounts = {
  open: 0,
  in_progress: 0,
  resolved: 0,
  total: 0,
}

export function formatDateTime(dateValue?: string | null) {
  if (!dateValue) return "—"

  return new Date(dateValue).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function statusStyles(status: SupportStatus) {
  if (status === "resolved") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200"
  }

  if (status === "in_progress") {
    return "bg-amber-50 text-amber-700 border-amber-200"
  }

  return "bg-blue-50 text-blue-700 border-blue-200"
}

export function issueStatusStyles(status: IssueStatus) {
  if (status === "resolved") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200"
  }

  if (status === "in_progress") {
    return "bg-amber-50 text-amber-700 border-amber-200"
  }

  return "bg-blue-50 text-blue-700 border-blue-200"
}

export function fraudStatusStyles(status: FraudStatus) {
  if (status === "resolved") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200"
  }

  if (status === "dismissed") {
    return "bg-gray-100 text-gray-700 border-gray-200"
  }

  if (status === "investigating") {
    return "bg-amber-50 text-amber-700 border-amber-200"
  }

  if (status === "under_review") {
    return "bg-violet-50 text-violet-700 border-violet-200"
  }

  return "bg-blue-50 text-blue-700 border-blue-200"
}

export function suggestionStatusStyles(status: SuggestionStatus) {
  if (status === "approved") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200"
  }

  if (status === "rejected") {
    return "bg-red-50 text-red-700 border-red-200"
  }

  return "bg-amber-50 text-amber-700 border-amber-200"
}

export function formatAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 2,
    }).format(Number(amount || 0))
  } catch {
    return `${currency || "INR"} ${Number(amount || 0).toFixed(2)}`
  }
}
