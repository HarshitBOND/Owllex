import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AdminLogRecord } from "../types"
import { formatDateTime } from "../utils"
import { Pagination } from "./Pagination"

interface LogsTabProps {
  logs: AdminLogRecord[]
  logsTotal: number
  logsPage: number
  logsTotalPages: number
  logsActionFilter: string
  setLogsActionFilter: (value: string) => void
  onSearch: (page?: number) => void
}

export function LogsTab({
  logs,
  logsTotal,
  logsPage,
  logsTotalPages,
  logsActionFilter,
  setLogsActionFilter,
  onSearch,
}: LogsTabProps) {
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-wrap gap-2">
          <select
            value={logsActionFilter}
            onChange={(e) => { setLogsActionFilter(e.target.value); setTimeout(() => onSearch(), 0) }}
            className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800"
          >
            <option value="">All Actions</option>
            <option value="viewed_dashboard">Viewed Dashboard</option>
            <option value="viewed_users">Viewed Users</option>
            <option value="viewed_transactions">Viewed Transactions</option>
            <option value="viewed_documents">Viewed Documents</option>
            <option value="banned_user">Banned User</option>
            <option value="unbanned_user">Unbanned User</option>
          </select>
          <Button size="sm" onClick={() => onSearch()} className="gap-1.5">
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{logsTotal} total log entries</p>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Admin</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Action</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Target</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Details</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">IP Address</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No admin logs yet</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        {log.adminId ? `${log.adminId.firstName} ${log.adminId.lastName}` : "System"}
                      </p>
                      <p className="text-xs text-gray-500">{log.adminId?.email || ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-mono font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 capitalize text-xs">{log.targetType}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[250px] truncate text-xs">{log.details || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{log.ipAddress}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">{formatDateTime(log.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={logsPage}
          totalPages={logsTotalPages}
          total={logsTotal}
          label="logs"
          onPrev={() => onSearch(logsPage - 1)}
          onNext={() => onSearch(logsPage + 1)}
        />
      </div>
    </div>
  )
}
