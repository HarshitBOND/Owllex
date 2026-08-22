import { CreditCard, FileText, IndianRupee, TrendingUp, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DashboardStats, TransactionRecord, UserRecord, Tab } from "../types"
import { formatCurrency, formatDate, roleBadge, statusBadge } from "../utils"

interface DashboardTabProps {
  loading: boolean
  stats: DashboardStats | null
  recentUsers: UserRecord[]
  recentTransactions: TransactionRecord[]
  onNavigateTab: (tab: Tab) => void
}

export function DashboardTab({ loading, stats, recentUsers, recentTransactions, onNavigateTab }: DashboardTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[
          { name: "Total Users", value: stats?.totalUsers ?? 0, icon: Users, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800" },
          { name: "Total Transactions", value: stats?.totalTransactions ?? 0, icon: CreditCard, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-900/20", border: "border-violet-200 dark:border-violet-800" },
          { name: "Total Revenue", value: formatCurrency(stats?.totalRevenue ?? 0), icon: IndianRupee, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800", isText: true },
          { name: "Documents Generated", value: stats?.totalDocuments ?? 0, icon: FileText, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-800" },
        ].map((item) => (
          <div
            key={item.name}
            className={cn(
              "bg-white dark:bg-gray-900 rounded-xl border p-4 md:p-5 shadow-sm hover:shadow-md transition-all duration-300 group",
              item.border
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={cn("p-2 rounded-lg", item.bg)}>
                <item.icon className={cn("h-5 w-5", item.color)} />
              </div>
              <TrendingUp className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
            </div>
            <p className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
              {loading ? "—" : ("isText" in item ? item.value : item.value)}
            </p>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-1">{item.name}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[
          { name: "Active Users", value: stats?.activeUsers ?? 0, color: "text-emerald-600" },
          { name: "Banned Users", value: stats?.bannedUsers ?? 0, color: "text-red-600" },
          { name: "Pending Payments", value: stats?.pendingTransactions ?? 0, color: "text-amber-600" },
          { name: "Admin Actions", value: stats?.totalAdminLogs ?? 0, color: "text-violet-600" },
        ].map((item) => (
          <div key={item.name} className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-4 shadow-sm">
            <p className={cn("text-xl font-bold", item.color)}>{loading ? "—" : item.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.name}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-blue-600" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Recent Users</h3>
            </div>
            <button onClick={() => onNavigateTab("users")} className="text-xs text-blue-600 hover:underline">
              View All
            </button>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {recentUsers.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-500">No users yet</p>
            ) : (
              recentUsers.map((u) => (
                <div key={u._id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {u.firstName} {u.lastName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{u.email || "No email"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {roleBadge(u.role)}
                    <span className="text-xs text-gray-400">{formatDate(u.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <CreditCard size={18} className="text-violet-600" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Recent Transactions</h3>
            </div>
            <button onClick={() => onNavigateTab("transactions")} className="text-xs text-violet-600 hover:underline">
              View All
            </button>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {recentTransactions.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-500">No transactions yet</p>
            ) : (
              recentTransactions.map((tx) => (
                <div key={tx._id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {tx.userId ? `${tx.userId.firstName} ${tx.userId.lastName}` : "Unknown"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{tx.paymentGateway} · {tx.description || "Payment"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(tx.status)}
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(tx.amount, tx.currency)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
