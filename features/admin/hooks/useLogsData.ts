import { useCallback, useState } from "react"
import type { AdminLogRecord } from "../types"

export function useLogsData() {
  const [logs, setLogs] = useState<AdminLogRecord[]>([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [logsPage, setLogsPage] = useState(1)
  const [logsTotalPages, setLogsTotalPages] = useState(1)
  const [logsActionFilter, setLogsActionFilter] = useState("")

  const fetchLogs = useCallback(async (page = 1) => {
    try {
      const p = new URLSearchParams({ page: String(page), limit: "20" })
      if (logsActionFilter) p.set("action", logsActionFilter)
      const res = await fetch(`/api/admin/logs?${p}`)
      const data = await res.json()
      if (data.success) {
        setLogs(data.logs)
        setLogsTotal(data.total)
        setLogsPage(data.page)
        setLogsTotalPages(data.totalPages)
      }
    } catch (err) {
      console.error("Logs fetch error:", err)
    }
  }, [logsActionFilter])

  return {
    logs,
    logsTotal,
    logsPage,
    logsTotalPages,
    logsActionFilter,
    setLogsActionFilter,
    fetchLogs,
  }
}
