import { useCallback, useState } from "react"
import type { IssueStatus, NotificationIssue, NotificationIssueCounts } from "../types"
import { defaultIssueCounts } from "../utils"

export function useNotificationIssues(isSupport: boolean | null) {
  const [notificationIssues, setNotificationIssues] = useState<NotificationIssue[]>([])
  const [notificationIssueCounts, setNotificationIssueCounts] = useState<NotificationIssueCounts>(defaultIssueCounts)
  const [notificationIssueFilter, setNotificationIssueFilter] = useState<"all" | IssueStatus>("all")
  const [notificationSearch, setNotificationSearch] = useState("")
  const [notificationLoading, setNotificationLoading] = useState(true)
  const [notificationUpdatingId, setNotificationUpdatingId] = useState<string | null>(null)
  const [notificationNotesById, setNotificationNotesById] = useState<Record<string, string>>({})

  const fetchNotificationIssues = useCallback(async () => {
    if (!isSupport) return

    setNotificationLoading(true)

    try {
      const params = new URLSearchParams({
        page: "1",
        limit: "20",
      })

      if (notificationIssueFilter !== "all") {
        params.set("issueStatus", notificationIssueFilter)
      }

      if (notificationSearch.trim()) {
        params.set("search", notificationSearch.trim())
      }

      const response = await fetch(`/api/support/notifications/failures?${params.toString()}`)
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to fetch notification issues")
      }

      setNotificationIssues(data.issues || [])
      setNotificationIssueCounts(data.counts || defaultIssueCounts)
      setNotificationNotesById((prev) => {
        const next = { ...prev }
        ;(data.issues || []).forEach((item: NotificationIssue) => {
          if (typeof next[item._id] === "undefined") {
            next[item._id] = item.supportIssueNotes || ""
          }
        })
        return next
      })
    } catch (error) {
      console.error("Notification issues fetch error:", error)
      setNotificationIssues([])
      setNotificationIssueCounts(defaultIssueCounts)
    } finally {
      setNotificationLoading(false)
    }
  }, [isSupport, notificationIssueFilter, notificationSearch])

  const retryNotificationIssue = async (notificationId: string) => {
    setNotificationUpdatingId(notificationId)

    try {
      const response = await fetch("/api/support/notifications/failures", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationId,
          action: "retry",
          supportIssueNotes: notificationNotesById[notificationId] || "",
        }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to retry failed notification")
      }

      await fetchNotificationIssues()
    } catch (error) {
      console.error("Notification retry error:", error)
    } finally {
      setNotificationUpdatingId(null)
    }
  }

  const updateNotificationIssueStatus = async (
    notificationId: string,
    supportIssueStatus: IssueStatus,
  ) => {
    setNotificationUpdatingId(notificationId)

    try {
      const response = await fetch("/api/support/notifications/failures", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationId,
          action: "update-status",
          supportIssueStatus,
          supportIssueNotes: notificationNotesById[notificationId] || "",
        }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to update notification issue status")
      }

      await fetchNotificationIssues()
    } catch (error) {
      console.error("Notification issue status update error:", error)
    } finally {
      setNotificationUpdatingId(null)
    }
  }

  return {
    notificationIssues,
    notificationIssueCounts,
    notificationIssueFilter,
    setNotificationIssueFilter,
    notificationSearch,
    setNotificationSearch,
    notificationLoading,
    notificationUpdatingId,
    notificationNotesById,
    setNotificationNotesById,
    fetchNotificationIssues,
    retryNotificationIssue,
    updateNotificationIssueStatus,
  }
}
