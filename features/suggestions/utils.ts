import type { SuggestionStatus } from "./types"

export const categories = [
  "All",
  "Case Strategy",
  "Client Management",
  "Practice Management",
  "Legal Research",
  "Compliance",
  "Automation",
  "General",
]

export const statusFilters: Array<{ label: string; value: "all" | SuggestionStatus }> = [
  { label: "All", value: "all" },
  { label: "Approved", value: "approved" },
  { label: "My Pending", value: "pending" },
  { label: "My Rejected", value: "rejected" },
]

export function getStatusStyle(status: SuggestionStatus) {
  if (status === "approved") return "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30"
  if (status === "rejected") return "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30"
  return "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30"
}
