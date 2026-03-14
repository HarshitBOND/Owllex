"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import {
  Users, CreditCard, FileText, Shield, LayoutDashboard,
  Search, ChevronLeft, ChevronRight, RefreshCw, Ban, CheckCircle2,
  XCircle, Loader2, TrendingUp, DollarSign, Activity, Eye,
  Download, Filter, Calendar, AlertTriangle, FileSearch, Play,
  Trash2, Clock, Terminal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"

// ── Types ──────────────────────────────────────────────────────────────────

interface DashboardStats {
  totalUsers: number
  totalTransactions: number
  totalRevenue: number
  totalDocuments: number
  totalAdminLogs: number
  activeUsers: number
  bannedUsers: number
  pendingTransactions: number
}

interface UserRecord {
  _id: string
  firstName: string
  lastName: string
  email: string
  role: string
  isBanned: boolean
  signupDate: string
  lastLogin: string | null
  createdAt: string
}

interface TransactionRecord {
  _id: string
  userId: { _id: string; firstName: string; lastName: string; email: string } | null
  amount: number
  status: string
  paymentGateway: string
  description: string
  currency: string
  createdAt: string
}

interface DocumentRecord {
  _id: string
  userId: { _id: string; firstName: string; lastName: string; email: string } | null
  documentType: string
  title: string
  filePath: string
  fileSize: number
  createdAt: string
}

interface AdminLogRecord {
  _id: string
  adminId: { _id: string; firstName: string; lastName: string; email: string } | null
  action: string
  targetType: string
  details: string
  ipAddress: string
  createdAt: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

function formatDateTime(iso: string) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function formatCurrency(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatBytes(bytes: number) {
  if (!bytes) return "—"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    completed: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", icon: <CheckCircle2 size={12} /> },
    success: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", icon: <CheckCircle2 size={12} /> },
    pending: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", icon: <Loader2 size={12} className="animate-spin" /> },
    failed: { bg: "bg-red-50 border-red-200", text: "text-red-700", icon: <XCircle size={12} /> },
    refunded: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", icon: <RefreshCw size={12} /> },
  }
  const s = map[status] || { bg: "bg-gray-50 border-gray-200", text: "text-gray-600", icon: null }
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", s.bg, s.text)}>
      {s.icon} {status}
    </span>
  )
}

function roleBadge(role: string) {
  if (role === "admin") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200">
        <Shield size={10} /> Admin
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border-2 border-gray-200">
      User
    </span>
  )
}

// ── Tabs ───────────────────────────────────────────────────────────────────

type Tab = "dashboard" | "users" | "transactions" | "documents" | "logs" | "causelist"

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={15} /> },
  { id: "users", label: "Users", icon: <Users size={15} /> },
  { id: "transactions", label: "Transactions", icon: <CreditCard size={15} /> },
  { id: "documents", label: "Documents", icon: <FileText size={15} /> },
  { id: "logs", label: "Logs", icon: <Activity size={15} /> },
  { id: "causelist", label: "Cause List Parser", icon: <FileSearch size={15} /> },
]

// ── Main Page ──────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { isOpen } = useSidebar()
  const { isLoaded, isSignedIn } = useUser()
  const router = useRouter()

  const [activeTab, setActiveTab] = useState<Tab>("dashboard")
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  // Dashboard state
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentUsers, setRecentUsers] = useState<UserRecord[]>([])
  const [recentTransactions, setRecentTransactions] = useState<TransactionRecord[]>([])

  // Users state
  const [users, setUsers] = useState<UserRecord[]>([])
  const [usersTotal, setUsersTotal] = useState(0)
  const [usersPage, setUsersPage] = useState(1)
  const [usersTotalPages, setUsersTotalPages] = useState(1)
  const [usersSearch, setUsersSearch] = useState("")
  const [usersRoleFilter, setUsersRoleFilter] = useState("")
  const [usersBannedFilter, setUsersBannedFilter] = useState("")
  const [banningId, setBanningId] = useState<string | null>(null)

  // Transactions state
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [txTotal, setTxTotal] = useState(0)
  const [txPage, setTxPage] = useState(1)
  const [txTotalPages, setTxTotalPages] = useState(1)
  const [txStatusFilter, setTxStatusFilter] = useState("")
  const [txDateFrom, setTxDateFrom] = useState("")
  const [txDateTo, setTxDateTo] = useState("")

  // Documents state
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [docsTotal, setDocsTotal] = useState(0)
  const [docsPage, setDocsPage] = useState(1)
  const [docsTotalPages, setDocsTotalPages] = useState(1)
  const [docsSearch, setDocsSearch] = useState("")
  const [docsTypeFilter, setDocsTypeFilter] = useState("")

  // Logs state
  const [logs, setLogs] = useState<AdminLogRecord[]>([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [logsPage, setLogsPage] = useState(1)
  const [logsTotalPages, setLogsTotalPages] = useState(1)
  const [logsActionFilter, setLogsActionFilter] = useState("")

  // Causelist Parser state
  const [clStatus, setClStatus] = useState<any>(null)
  const [clImportId, setClImportId] = useState<string | null>(null)
  const [clRunning, setClRunning] = useState(false)
  const [clProgress, setClProgress] = useState<any[]>([])
  const [clSummary, setClSummary] = useState<any>(null)
  const [clAutoDelete, setClAutoDelete] = useState(true)
  const [clDaysBack, setClDaysBack] = useState(3)
  const [clFromCheckpoint, setClFromCheckpoint] = useState(true)
  const [clBackendError, setClBackendError] = useState<string | null>(null)

  // ── Admin check ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isSignedIn) return
    fetch("/api/admin/check")
      .then((res) => {
        if (res.ok) return res.json()
        throw new Error("not admin")
      })
      .then((d) => setIsAdmin(d.isAdmin === true))
      .catch(() => setIsAdmin(false))
  }, [isSignedIn])

  // ── Data fetchers ────────────────────────────────────────────────────────

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

  const fetchUsers = useCallback(async (page = 1) => {
    try {
      const p = new URLSearchParams({ page: String(page), limit: "20" })
      if (usersSearch) p.set("search", usersSearch)
      if (usersRoleFilter) p.set("role", usersRoleFilter)
      if (usersBannedFilter) p.set("banned", usersBannedFilter)
      const res = await fetch(`/api/admin/users?${p}`)
      const data = await res.json()
      if (data.success) {
        setUsers(data.users)
        setUsersTotal(data.total)
        setUsersPage(data.page)
        setUsersTotalPages(data.totalPages)
      }
    } catch (err) {
      console.error("Users fetch error:", err)
    }
  }, [usersSearch, usersRoleFilter, usersBannedFilter])

  const fetchTransactions = useCallback(async (page = 1) => {
    try {
      const p = new URLSearchParams({ page: String(page), limit: "20" })
      if (txStatusFilter) p.set("status", txStatusFilter)
      if (txDateFrom) p.set("dateFrom", txDateFrom)
      if (txDateTo) p.set("dateTo", txDateTo)
      const res = await fetch(`/api/admin/transactions?${p}`)
      const data = await res.json()
      if (data.success) {
        setTransactions(data.transactions)
        setTxTotal(data.total)
        setTxPage(data.page)
        setTxTotalPages(data.totalPages)
      }
    } catch (err) {
      console.error("Transactions fetch error:", err)
    }
  }, [txStatusFilter, txDateFrom, txDateTo])

  const fetchDocuments = useCallback(async (page = 1) => {
    try {
      const p = new URLSearchParams({ page: String(page), limit: "20" })
      if (docsSearch) p.set("search", docsSearch)
      if (docsTypeFilter) p.set("type", docsTypeFilter)
      const res = await fetch(`/api/admin/documents?${p}`)
      const data = await res.json()
      if (data.success) {
        setDocuments(data.documents)
        setDocsTotal(data.total)
        setDocsPage(data.page)
        setDocsTotalPages(data.totalPages)
      }
    } catch (err) {
      console.error("Documents fetch error:", err)
    }
  }, [docsSearch, docsTypeFilter])

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

  const fetchCauselistStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/scraper/causelist-status")
      const data = await res.json()
      if (data.success) {
        setClBackendError(null)
        setClStatus(data)
        if (data.current_session) {
          setClImportId(data.current_session.import_id)
          setClRunning(true)
        }
      } else if (data.error?.includes("Python backend")) {
        setClBackendError(data.error)
      }
    } catch (err) {
      console.error("Causelist status fetch error:", err)
    }
  }, [])

  // Fetch data when tab changes
  useEffect(() => {
    if (isAdmin !== true) return
    if (activeTab === "dashboard") fetchDashboard()
    else if (activeTab === "users") fetchUsers()
    else if (activeTab === "transactions") fetchTransactions()
    else if (activeTab === "documents") fetchDocuments()
    else if (activeTab === "logs") fetchLogs()
    else if (activeTab === "causelist") fetchCauselistStatus()
  }, [activeTab, isAdmin, fetchDashboard, fetchUsers, fetchTransactions, fetchDocuments, fetchLogs, fetchCauselistStatus])

  // ── Ban/Unban handler ────────────────────────────────────────────────────

  const handleBanToggle = async (userId: string, currentlyBanned: boolean) => {
    setBanningId(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}/ban`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banned: !currentlyBanned }),
      })
      const data = await res.json()
      if (data.success) {
        setUsers((prev) =>
          prev.map((u) =>
            u._id === userId ? { ...u, isBanned: !currentlyBanned } : u
          )
        )
      } else {
        alert(data.error || "Failed to update user status")
      }
    } catch {
      alert("Network error")
    } finally {
      setBanningId(null)
    }
  }

  // ── Pagination component ─────────────────────────────────────────────────

  const Pagination = ({
    page,
    totalPages,
    total,
    onPrev,
    onNext,
    label,
  }: {
    page: number
    totalPages: number
    total: number
    onPrev: () => void
    onNext: () => void
    label: string
  }) =>
    totalPages > 1 ? (
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Page {page} of {totalPages} · {total} {label}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={onPrev}
            disabled={page <= 1}
            className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={onNext}
            disabled={page >= totalPages}
            className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    ) : null

  // ── Tab Content ──────────────────────────────────────────────────────────

  const DashboardTab = () => (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[
          { name: "Total Users", value: stats?.totalUsers ?? 0, icon: Users, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800" },
          { name: "Total Transactions", value: stats?.totalTransactions ?? 0, icon: CreditCard, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-900/20", border: "border-violet-200 dark:border-violet-800" },
          { name: "Total Revenue", value: formatCurrency(stats?.totalRevenue ?? 0), icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800", isText: true },
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

      {/* Secondary stats */}
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

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Users */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-blue-600" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Recent Users</h3>
            </div>
            <button onClick={() => setActiveTab("users")} className="text-xs text-blue-600 hover:underline">
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

        {/* Recent Transactions */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <CreditCard size={18} className="text-violet-600" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Recent Transactions</h3>
            </div>
            <button onClick={() => setActiveTab("transactions")} className="text-xs text-violet-600 hover:underline">
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

  const UsersTab = () => (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={usersSearch}
              onChange={(e) => setUsersSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchUsers()}
              placeholder="Search by name or email..."
              className="w-full pl-9 pr-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
          </div>
          <select
            value={usersRoleFilter}
            onChange={(e) => { setUsersRoleFilter(e.target.value); setTimeout(() => fetchUsers(), 0) }}
            className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800"
          >
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select>
          <select
            value={usersBannedFilter}
            onChange={(e) => { setUsersBannedFilter(e.target.value); setTimeout(() => fetchUsers(), 0) }}
            className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800"
          >
            <option value="">All Status</option>
            <option value="false">Active</option>
            <option value="true">Banned</option>
          </select>
          <Button size="sm" onClick={() => fetchUsers()} className="gap-1.5">
            <Search size={14} /> Search
          </Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{usersTotal} total users</p>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Signed Up</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Last Login</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No users found</td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                      {u.firstName} {u.lastName}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{u.email || "—"}</td>
                    <td className="px-4 py-3">{roleBadge(u.role)}</td>
                    <td className="px-4 py-3">
                      {u.isBanned ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                          <Ban size={10} /> Banned
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 size={10} /> Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">{formatDate(u.signupDate || u.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">{u.lastLogin ? formatDateTime(u.lastLogin) : "Never"}</td>
                    <td className="px-4 py-3">
                      {u.role !== "admin" && (
                        <Button
                          size="sm"
                          variant={u.isBanned ? "default" : "destructive"}
                          className="h-7 text-xs gap-1"
                          disabled={banningId === u._id}
                          onClick={() => handleBanToggle(u._id, u.isBanned)}
                        >
                          {banningId === u._id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : u.isBanned ? (
                            <>
                              <CheckCircle2 size={12} /> Unban
                            </>
                          ) : (
                            <>
                              <Ban size={12} /> Ban
                            </>
                          )}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={usersPage}
          totalPages={usersTotalPages}
          total={usersTotal}
          label="users"
          onPrev={() => fetchUsers(usersPage - 1)}
          onNext={() => fetchUsers(usersPage + 1)}
        />
      </div>
    </div>
  )

  const TransactionsTab = () => (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-wrap gap-2">
          <select
            value={txStatusFilter}
            onChange={(e) => { setTxStatusFilter(e.target.value); setTimeout(() => fetchTransactions(), 0) }}
            className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
          <div className="flex items-center gap-1">
            <Calendar size={14} className="text-gray-400" />
            <input
              type="date"
              value={txDateFrom}
              onChange={(e) => setTxDateFrom(e.target.value)}
              className="px-2 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800"
            />
            <span className="text-gray-400 text-xs">to</span>
            <input
              type="date"
              value={txDateTo}
              onChange={(e) => setTxDateTo(e.target.value)}
              className="px-2 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800"
            />
          </div>
          <Button size="sm" onClick={() => fetchTransactions()} className="gap-1.5">
            <Filter size={14} /> Apply
          </Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{txTotal} total transactions</p>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Gateway</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Description</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No transactions found</td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        {tx.userId ? `${tx.userId.firstName} ${tx.userId.lastName}` : "Unknown"}
                      </p>
                      <p className="text-xs text-gray-500">{tx.userId?.email || ""}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                      {formatCurrency(tx.amount, tx.currency)}
                    </td>
                    <td className="px-4 py-3">{statusBadge(tx.status)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 capitalize">{tx.paymentGateway}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[200px] truncate">{tx.description || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">{formatDateTime(tx.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={txPage}
          totalPages={txTotalPages}
          total={txTotal}
          label="transactions"
          onPrev={() => fetchTransactions(txPage - 1)}
          onNext={() => fetchTransactions(txPage + 1)}
        />
      </div>
    </div>
  )

  const DocumentsTab = () => (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={docsSearch}
              onChange={(e) => setDocsSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchDocuments()}
              placeholder="Search documents..."
              className="w-full pl-9 pr-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
          </div>
          <select
            value={docsTypeFilter}
            onChange={(e) => { setDocsTypeFilter(e.target.value); setTimeout(() => fetchDocuments(), 0) }}
            className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800"
          >
            <option value="">All Types</option>
            <option value="affidavit">Affidavit</option>
            <option value="invoice">Invoice</option>
            <option value="legal_notice">Legal Notice</option>
            <option value="contract">Contract</option>
            <option value="report">Report</option>
            <option value="other">Other</option>
          </select>
          <Button size="sm" onClick={() => fetchDocuments()} className="gap-1.5">
            <Search size={14} /> Search
          </Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{docsTotal} total documents</p>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Size</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Created</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No documents found</td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[200px] truncate">
                      {doc.title || doc.filePath.split("/").pop() || "Untitled"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 capitalize">
                        {doc.documentType.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-sm">
                      {doc.userId ? `${doc.userId.firstName} ${doc.userId.lastName}` : "Unknown"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{formatBytes(doc.fileSize)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">{formatDateTime(doc.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                        <Eye size={12} /> View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={docsPage}
          totalPages={docsTotalPages}
          total={docsTotal}
          label="documents"
          onPrev={() => fetchDocuments(docsPage - 1)}
          onNext={() => fetchDocuments(docsPage + 1)}
        />
      </div>
    </div>
  )

  const LogsTab = () => (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-wrap gap-2">
          <select
            value={logsActionFilter}
            onChange={(e) => { setLogsActionFilter(e.target.value); setTimeout(() => fetchLogs(), 0) }}
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
          <Button size="sm" onClick={() => fetchLogs()} className="gap-1.5">
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{logsTotal} total log entries</p>
      </div>

      {/* Table */}
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
          onPrev={() => fetchLogs(logsPage - 1)}
          onNext={() => fetchLogs(logsPage + 1)}
        />
      </div>
    </div>
  )

  // ── Causelist polling effect ─────────────────────────────────────────────

  useEffect(() => {
    if (!clRunning || !clImportId) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/scraper/progress/${clImportId}`)
        const data = await res.json()
        if (data.success) {
          setClProgress(data.log || [])
          if (data.status === "completed" || data.status === "failed") {
            setClRunning(false)
            setClSummary(data.summary)
            fetchCauselistStatus()
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clRunning, clImportId])

  // ── Causelist import handler ─────────────────────────────────────────────

  const handleStartCauselistImport = async () => {
    setClRunning(true)
    setClProgress([])
    setClSummary(null)
    setClBackendError(null)
    try {
      const res = await fetch("/api/scraper/parse-causelist-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days_back: clDaysBack,
          auto_delete_pdfs: clAutoDelete,
          start_from_checkpoint: clFromCheckpoint,
        }),
      })
      const data = await res.json()
      if (data.success && data.import_id) {
        setClImportId(data.import_id)
      } else {
        setClRunning(false)
        if (data.error?.includes("Python backend")) {
          setClBackendError(data.error)
        } else {
          alert(data.error || "Failed to start import")
        }
      }
    } catch {
      setClRunning(false)
      alert("Network error starting import")
    }
  }

  // ── CauseList Tab ────────────────────────────────────────────────────────

  const CauseListTab = () => (
    <div className="space-y-6">
      {/* Backend Error Banner */}
      {clBackendError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-red-600 text-lg">⚠️</span>
            <div>
              <p className="font-semibold text-red-800 dark:text-red-300">Python Backend Not Running</p>
              <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                The causelist parser requires the Python backend server. Start it by running:
              </p>
              <code className="block mt-2 bg-red-100 dark:bg-red-900/40 px-3 py-2 rounded text-sm text-red-900 dark:text-red-200 font-mono">
                cd backend &amp;&amp; python run.py
              </code>
              <button
                onClick={() => { setClBackendError(null); fetchCauselistStatus() }}
                className="mt-3 text-sm text-red-700 dark:text-red-300 underline hover:no-underline"
              >
                Retry connection
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Last Import Status Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-blue-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Last Import</h3>
          </div>
          {clStatus?.last_import ? (
            <div className="space-y-1.5 text-sm">
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">Date:</span>{" "}
                {clStatus.last_import.run_date ? formatDateTime(clStatus.last_import.run_date) : "—"}
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">Status:</span>{" "}
                {statusBadge(clStatus.last_import.status || "unknown")}
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">PDFs:</span> {clStatus.last_import.pdfs_found ?? 0} found,{" "}
                {clStatus.last_import.pdfs_downloaded ?? 0} downloaded
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">Cases:</span> {clStatus.last_import.cases_extracted ?? 0} extracted
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No imports yet</p>
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <FileSearch size={16} className="text-violet-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Checkpoint</h3>
          </div>
          {clStatus?.last_checkpoint ? (
            <div className="space-y-1.5 text-sm">
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">Last PDF:</span>{" "}
                <span className="font-mono text-xs break-all">{clStatus.last_checkpoint.checkpoint_identifier || "—"}</span>
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">Processed at:</span>{" "}
                {clStatus.last_checkpoint.last_processed_timestamp
                  ? formatDateTime(clStatus.last_checkpoint.last_processed_timestamp)
                  : "—"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No checkpoint set (first run)</p>
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} className="text-emerald-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Current Session</h3>
          </div>
          {clStatus?.current_session ? (
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-amber-600" />
                <span className="text-amber-600 font-medium">Import running...</span>
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">Started:</span>{" "}
                {formatDateTime(clStatus.current_session.started_at)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No active import</p>
          )}
        </div>
      </div>

      {/* Control Panel */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Import Controls</h3>
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={clAutoDelete}
                onChange={(e) => setClAutoDelete(e.target.checked)}
                className="rounded border-gray-300 text-sidebar-primary focus:ring-sidebar-primary"
                disabled={clRunning}
              />
              <span className="flex items-center gap-1">
                <Trash2 size={13} />
                Auto-delete PDFs after parsing (saves storage)
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={clFromCheckpoint}
                onChange={(e) => setClFromCheckpoint(e.target.checked)}
                className="rounded border-gray-300 text-sidebar-primary focus:ring-sidebar-primary"
                disabled={clRunning}
              />
              <span>Start from last checkpoint (skip already processed)</span>
            </label>
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <label htmlFor="days-back">Import last</label>
              <select
                id="days-back"
                value={clDaysBack}
                onChange={(e) => setClDaysBack(Number(e.target.value))}
                disabled={clRunning}
                className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
              >
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </div>
          </div>
          <div className="md:ml-auto">
            <Button
              onClick={handleStartCauselistImport}
              disabled={clRunning || !!clBackendError}
              className="gap-2"
              size="lg"
            >
              {clRunning ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play size={16} />
                  Start Cause List Import
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Progress Log */}
      {(clRunning || clProgress.length > 0) && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal size={15} className="text-gray-600" />
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Progress Log</h3>
            </div>
            {clRunning && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600">
                <Loader2 size={12} className="animate-spin" />
                Processing...
              </div>
            )}
          </div>
          <div className="p-4 max-h-[400px] overflow-y-auto bg-gray-50 dark:bg-gray-950 font-mono text-xs space-y-1">
            {clProgress.length === 0 ? (
              <p className="text-gray-500">Waiting for updates...</p>
            ) : (
              clProgress.map((entry, i) => {
                const icon =
                  entry.status === "completed" ? "✅" :
                  entry.status === "error" ? "❌" :
                  entry.status === "cleaning" ? "🗑️" :
                  entry.status === "parsing" ? "📄" :
                  entry.status === "downloading" ? "⬇️" :
                  "→"
                return (
                  <p
                    key={i}
                    className={cn(
                      "py-0.5",
                      entry.status === "error" ? "text-red-600" :
                      entry.status === "completed" ? "text-emerald-600" :
                      "text-gray-700 dark:text-gray-300"
                    )}
                  >
                    {icon} {entry.message}
                  </p>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Summary Card */}
      {clSummary && !clRunning && (
        <div className={cn(
          "rounded-xl border p-5 shadow-sm",
          clSummary.status === "completed"
            ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
            : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
        )}>
          <div className="flex items-center gap-2 mb-3">
            {clSummary.status === "completed" ? (
              <CheckCircle2 size={18} className="text-emerald-600" />
            ) : (
              <XCircle size={18} className="text-red-600" />
            )}
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Import {clSummary.status === "completed" ? "Complete" : "Failed"}
            </h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-gray-500 text-xs">PDFs Found</p>
              <p className="font-semibold text-gray-900 dark:text-white text-lg">{clSummary.pdfs_found ?? 0}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">PDFs Processed</p>
              <p className="font-semibold text-gray-900 dark:text-white text-lg">{clSummary.pdfs_processed ?? 0}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Cases Extracted</p>
              <p className="font-semibold text-gray-900 dark:text-white text-lg">{clSummary.cases_parsed ?? 0}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Errors</p>
              <p className={cn(
                "font-semibold text-lg",
                (clSummary.errors ?? 0) > 0 ? "text-red-600" : "text-gray-900 dark:text-white"
              )}>
                {clSummary.errors ?? 0}
              </p>
            </div>
          </div>
          {clSummary.execution_time_seconds && (
            <p className="text-xs text-gray-500 mt-2">
              Completed in {clSummary.execution_time_seconds}s
            </p>
          )}
        </div>
      )}
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────────────

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F3F5F9] dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isSignedIn) {
    if (typeof window !== "undefined") window.location.href = "/"
    return null
  }

  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F3F5F9] dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Verifying admin access...</p>
        </div>
      </div>
    )
  }

  if (isAdmin === false) {
    if (typeof window !== "undefined") window.location.href = "/"
    return null
  }

  return (
    <div className="flex">
      <Sidebar />
      <div
        className={cn(
          "bg-[#F3F5F9] dark:bg-gray-950 flex flex-col items-start min-h-screen h-fit w-full transition-all duration-300",
          isOpen ? "lg:ml-48" : "lg:ml-12"
        )}
      >
        <div className="w-full">
          {/* Header */}
          <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 w-full">
            <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
              <Navbar location="Admin Panel" />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                    Admin Panel
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Manage users, transactions, documents, and system logs
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (activeTab === "dashboard") fetchDashboard()
                    else if (activeTab === "users") fetchUsers()
                    else if (activeTab === "transactions") fetchTransactions()
                    else if (activeTab === "documents") fetchDocuments()
                    else if (activeTab === "logs") fetchLogs()
                    else if (activeTab === "causelist") fetchCauselistStatus()
                  }}
                  className="gap-1.5"
                >
                  <RefreshCw size={14} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
            <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6">
              <div className="flex gap-1 overflow-x-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                      activeTab === tab.id
                        ? "border-sidebar-primary text-sidebar-primary"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    )}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-6">
            {activeTab === "dashboard" && <DashboardTab />}
            {activeTab === "users" && <UsersTab />}
            {activeTab === "transactions" && <TransactionsTab />}
            {activeTab === "documents" && <DocumentsTab />}
            {activeTab === "logs" && <LogsTab />}
            {activeTab === "causelist" && <CauseListTab />}
          </div>
        </div>
      </div>
    </div>
  )
}
