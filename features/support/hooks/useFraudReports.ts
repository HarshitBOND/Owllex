import { useCallback, useState } from "react"
import type { FraudCounts, FraudReportItem, FraudStatus } from "../types"
import { defaultFraudCounts } from "../utils"

export function useFraudReports(isSupport: boolean | null) {
  const [fraudReports, setFraudReports] = useState<FraudReportItem[]>([])
  const [fraudCounts, setFraudCounts] = useState<FraudCounts>(defaultFraudCounts)
  const [fraudStatusFilter, setFraudStatusFilter] = useState<"all" | FraudStatus>("all")
  const [fraudSearch, setFraudSearch] = useState("")
  const [fraudLoading, setFraudLoading] = useState(true)
  const [fraudUpdatingId, setFraudUpdatingId] = useState<string | null>(null)
  const [fraudNotesById, setFraudNotesById] = useState<Record<string, string>>({})

  const fetchFraudReports = useCallback(async () => {
    if (!isSupport) return

    setFraudLoading(true)

    try {
      const params = new URLSearchParams({
        page: "1",
        limit: "20",
      })

      if (fraudStatusFilter !== "all") {
        params.set("status", fraudStatusFilter)
      }

      if (fraudSearch.trim()) {
        params.set("search", fraudSearch.trim())
      }

      const response = await fetch(`/api/support/fraud-reports?${params.toString()}`)
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to fetch fraud reports")
      }

      setFraudReports(data.reports || [])
      setFraudCounts(data.counts || defaultFraudCounts)
      setFraudNotesById((prev) => {
        const next = { ...prev }
        ;(data.reports || []).forEach((item: FraudReportItem) => {
          if (typeof next[item._id] === "undefined") {
            next[item._id] = item.resolutionNotes || ""
          }
        })
        return next
      })
    } catch (error) {
      console.error("Fraud reports fetch error:", error)
      setFraudReports([])
      setFraudCounts(defaultFraudCounts)
    } finally {
      setFraudLoading(false)
    }
  }, [isSupport, fraudStatusFilter, fraudSearch])

  const updateFraudStatus = async (reportId: string, status: FraudStatus) => {
    setFraudUpdatingId(reportId)

    try {
      const response = await fetch("/api/support/fraud-reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          status,
          resolutionNotes: fraudNotesById[reportId] || "",
        }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to update fraud report status")
      }

      await fetchFraudReports()
    } catch (error) {
      console.error("Fraud report status update error:", error)
    } finally {
      setFraudUpdatingId(null)
    }
  }

  return {
    fraudReports,
    fraudCounts,
    fraudStatusFilter,
    setFraudStatusFilter,
    fraudSearch,
    setFraudSearch,
    fraudLoading,
    fraudUpdatingId,
    fraudNotesById,
    setFraudNotesById,
    fetchFraudReports,
    updateFraudStatus,
  }
}
