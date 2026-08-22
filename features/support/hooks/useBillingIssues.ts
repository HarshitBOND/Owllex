import { useCallback, useState } from "react"
import type { BillingIssue, BillingIssueCounts, IssueStatus } from "../types"
import { defaultBillingCounts } from "../utils"

export function useBillingIssues(isSupport: boolean | null) {
  const [billingIssues, setBillingIssues] = useState<BillingIssue[]>([])
  const [billingIssueCounts, setBillingIssueCounts] = useState<BillingIssueCounts>(defaultBillingCounts)
  const [billingIssueFilter, setBillingIssueFilter] = useState<"all" | IssueStatus>("all")
  const [billingSearch, setBillingSearch] = useState("")
  const [billingLoading, setBillingLoading] = useState(true)
  const [billingUpdatingId, setBillingUpdatingId] = useState<string | null>(null)
  const [billingNotesById, setBillingNotesById] = useState<Record<string, string>>({})

  const fetchBillingIssues = useCallback(async () => {
    if (!isSupport) return

    setBillingLoading(true)

    try {
      const params = new URLSearchParams({
        page: "1",
        limit: "20",
      })

      if (billingIssueFilter !== "all") {
        params.set("issueStatus", billingIssueFilter)
      }

      if (billingSearch.trim()) {
        params.set("search", billingSearch.trim())
      }

      const response = await fetch(`/api/support/billing-issues?${params.toString()}`)
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to fetch billing issues")
      }

      setBillingIssues(data.issues || [])
      setBillingIssueCounts(data.counts || defaultBillingCounts)
      setBillingNotesById((prev) => {
        const next = { ...prev }
        ;(data.issues || []).forEach((item: BillingIssue) => {
          if (typeof next[item._id] === "undefined") {
            next[item._id] = item.supportIssueNotes || ""
          }
        })
        return next
      })
    } catch (error) {
      console.error("Billing issues fetch error:", error)
      setBillingIssues([])
      setBillingIssueCounts(defaultBillingCounts)
    } finally {
      setBillingLoading(false)
    }
  }, [isSupport, billingIssueFilter, billingSearch])

  const updateBillingIssueStatus = async (
    transactionId: string,
    supportIssueStatus: IssueStatus,
  ) => {
    setBillingUpdatingId(transactionId)

    try {
      const response = await fetch("/api/support/billing-issues", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId,
          supportIssueStatus,
          supportIssueNotes: billingNotesById[transactionId] || "",
        }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to update billing issue status")
      }

      await fetchBillingIssues()
    } catch (error) {
      console.error("Billing issue status update error:", error)
    } finally {
      setBillingUpdatingId(null)
    }
  }

  return {
    billingIssues,
    billingIssueCounts,
    billingIssueFilter,
    setBillingIssueFilter,
    billingSearch,
    setBillingSearch,
    billingLoading,
    billingUpdatingId,
    billingNotesById,
    setBillingNotesById,
    fetchBillingIssues,
    updateBillingIssueStatus,
  }
}
