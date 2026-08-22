import { useCallback, useState } from "react"
import type { DashboardStats, TransactionRecord, UserRecord } from "../types"

export function useDashboardData() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentUsers, setRecentUsers] = useState<UserRecord[]>([])
  const [recentTransactions, setRecentTransactions] = useState<TransactionRecord[]>([])

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/admin/dashboard")
      const data = await res.json()
      if (data.success) {
        setStats(data.stats)
        setRecentUsers(data.recentUsers || [])
        setRecentTransactions(data.recentTransactions || [])
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  return { loading, stats, recentUsers, recentTransactions, fetchDashboard }
}
