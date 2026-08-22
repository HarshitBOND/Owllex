"use client"

import { useEffect, useState, useCallback } from "react"
import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import {
  FileDown, FileCheck2, FileX, Database, Clock, RefreshCw,
  Search, ChevronLeft, ChevronRight, Download, AlertCircle,
  CheckCircle2, XCircle, Loader2, Filter, Zap, TrendingUp,
  Activity, ShieldAlert,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"

// ── Types ──────────────────────────────────────────────────────────────────

interface ScraperStats {
  total_pdfs_processed: number
  completed: number
  failed: number
  total_cases_extracted: number
}

interface DownloadedPDF {
  filename: string
  download_url: string
  downloaded_at: string
  file_size_bytes: number
  file_hash: string
  parse_status: "pending" | "completed" | "failed"
  cases_extracted: number
  processed: boolean
  deleted_at: string | null
  execution_time_seconds: number
  error_message: string | null
}

interface ScraperLog {
  run_date: string
  pdfs_found: number
  pdfs_downloaded: number
  pdfs_skipped: number
  cases_extracted: number
  execution_time_seconds: number
  status: "success" | "partial" | "failed"
  error_message: string | null
}

interface ScrapedCase {
  list_type: string
  list_date: string
  court_no: string
  bench: string
  judge: string
  section: string
  item_no: string
  main_case_no: string
  linked_cases: string[]
  petitioner: string
  respondent: string
  advocate_petitioner: string
  advocate_respondent: string
  source_pdf: string
  parsed_at: string
  status: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

function formatDateTime(iso: string) {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function statusBadge(status: string) {
  switch (status) {
    case "completed":
    case "success":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 size={12} /> {status}
        </span>
      )
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
          <XCircle size={12} /> {status}
        </span>
      )
    case "pending":
    case "partial":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          <Loader2 size={12} className="animate-spin" /> {status}
        </span>
      )
    default:
      return <span className="text-xs text-gray-500">{status}</span>
  }
}

// ── Page Component ─────────────────────────────────────────────────────────

type Tab = "overview" | "cases" | "pdfs" | "logs"

export default function PDFScraperPage() {
  const { isOpen } = useSidebar()
  const { isLoaded, isSignedIn, user } = useUser()
  const [activeTab, setActiveTab] = useState<Tab>("overview")

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [stats, setStats] = useState<ScraperStats | null>(null)
  const [recentPdfs, setRecentPdfs] = useState<DownloadedPDF[]>([])
  const [recentLogs, setRecentLogs] = useState<ScraperLog[]>([])
  const [cases, setCases] = useState<ScrapedCase[]>([])
  const [casesTotal, setCasesTotal] = useState(0)
  const [casesPage, setCasesPage] = useState(1)
  const [casesTotalPages, setCasesTotalPages] = useState(1)
  const [caseSearch, setCaseSearch] = useState("")

  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [seedResult, setSeedResult] = useState<string | null>(null)

  // ── Admin check ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isSignedIn) return
    fetch("/api/scraper/admin-check")
      .then((res) => {
        if (res.ok) return res.json()
        throw new Error("not admin")
      })
      .then((d) => setIsAdmin(d.isAdmin === true))
      .catch(() => setIsAdmin(false))
  }, [isSignedIn])

  // ── Fetch status ─────────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/scraper/status")
      const data = await res.json()
      if (data.success) {
        setStats(data.stats)
        setRecentPdfs(data.recent_pdfs || [])
        setRecentLogs(data.recent_logs || [])
      }
    } catch (err) {
      console.error("Failed to fetch scraper status:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCases = useCallback(async (page = 1, search = "") => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" })
      if (search) params.set("search", search)
      const res = await fetch(`/api/scraper/cases?${params}`)
      const data = await res.json()
      if (data.success) {
        setCases(data.cases || [])
        setCasesTotal(data.total)
        setCasesPage(data.page)
        setCasesTotalPages(data.total_pages)
      }
    } catch (err) {
      console.error("Failed to fetch cases:", err)
    }
  }, [])

  useEffect(() => {
    if (isAdmin !== true) return
    fetchStatus()
    fetchCases()
  }, [fetchStatus, fetchCases, isAdmin])

  // ── Seed dummy data ──────────────────────────────────────────────────────

  const handleSeed = async () => {
    setSeeding(true)
    setSeedResult(null)
    try {
      const res = await fetch("/api/scraper/seed", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        setSeedResult(`Seeded ${data.summary.pdfs} PDFs, ${data.summary.cases} cases, ${data.summary.logs} logs`)
        // Refresh data
        await fetchStatus()
        await fetchCases()
      } else {
        setSeedResult(`Error: ${data.error}`)
      }
    } catch (err) {
      setSeedResult(`Error: ${err}`)
    } finally {
      setSeeding(false)
    }
  }

  // ── Search handler ───────────────────────────────────────────────────────

  const handleCaseSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchCases(1, caseSearch)
  }

  // ── Tab components ───────────────────────────────────────────────────────

  const OverviewTab = () => (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[
          {
            name: "PDFs Processed",
            value: stats?.total_pdfs_processed ?? 0,
            icon: FileDown,
            color: "text-blue-600",
            bgColor: "bg-blue-50",
            borderColor: "border-blue-200",
          },
          {
            name: "Completed",
            value: stats?.completed ?? 0,
            icon: FileCheck2,
            color: "text-emerald-600",
            bgColor: "bg-emerald-50",
            borderColor: "border-emerald-200",
          },
          {
            name: "Failed",
            value: stats?.failed ?? 0,
            icon: FileX,
            color: "text-red-600",
            bgColor: "bg-red-50",
            borderColor: "border-red-200",
          },
          {
            name: "Cases Extracted",
            value: stats?.total_cases_extracted ?? 0,
            icon: Database,
            color: "text-violet-600",
            bgColor: "bg-violet-50",
            borderColor: "border-violet-200",
          },
        ].map((item) => (
          <div
            key={item.name}
            className={cn(
              "bg-white rounded-xl border p-4 md:p-5 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer group",
              item.borderColor
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={cn("p-2 rounded-lg", item.bgColor)}>
                <item.icon className={cn("h-5 w-5", item.color)} />
              </div>
              {loading ? (
                <div className="w-5 h-5 border-2 border-t-transparent border-gray-300 rounded-full animate-spin" />
              ) : (
                <TrendingUp className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
              )}
            </div>
            <p className="text-2xl md:text-3xl font-bold text-gray-900">
              {loading ? "—" : item.value}
            </p>
            <p className="text-sm font-medium text-gray-700 mt-1">{item.name}</p>
          </div>
        ))}
      </div>

      {/* Recent Activity: Logs + PDFs side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Scraper Runs */}
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-sidebar-primary" />
              <h3 className="font-semibold text-gray-900">Recent Scraper Runs</h3>
            </div>
            <button
              onClick={() => setActiveTab("logs")}
              className="text-xs text-sidebar-primary hover:underline"
            >
              View All
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {recentLogs.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">No scraper runs yet</div>
            ) : (
              recentLogs.slice(0, 5).map((log, i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {formatDateTime(log.run_date)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {log.pdfs_downloaded} PDFs → {log.cases_extracted} cases
                      {log.pdfs_skipped > 0 && ` (${log.pdfs_skipped} skipped)`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{log.execution_time_seconds}s</span>
                    {statusBadge(log.status)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent PDFs */}
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <FileDown size={18} className="text-sidebar-primary" />
              <h3 className="font-semibold text-gray-900">Recent PDFs</h3>
            </div>
            <button
              onClick={() => setActiveTab("pdfs")}
              className="text-xs text-sidebar-primary hover:underline"
            >
              View All
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {recentPdfs.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">No PDFs processed yet</div>
            ) : (
              recentPdfs.slice(0, 5).map((pdf, i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{pdf.filename}</p>
                    <p className="text-xs text-gray-500">
                      {formatBytes(pdf.file_size_bytes)} · {pdf.cases_extracted} cases · {formatDate(pdf.downloaded_at)}
                    </p>
                  </div>
                  {statusBadge(pdf.parse_status)}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )

  const CasesTab = () => (
    <div className="space-y-4">
      {/* Search */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm p-4">
        <form onSubmit={handleCaseSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={caseSearch}
              onChange={(e) => setCaseSearch(e.target.value)}
              placeholder="Search by case number, petitioner, respondent, or judge..."
              className="w-full pl-9 pr-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sidebar-primary/30 focus:border-sidebar-primary"
            />
          </div>
          <Button type="submit" size="sm" className="bg-sidebar-primary hover:bg-sidebar-primary/90">
            <Search size={14} className="mr-1" /> Search
          </Button>
        </form>
        <p className="text-xs text-gray-500 mt-2">{casesTotal} total cases extracted</p>
      </div>

      {/* Cases Table */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Case No.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Petitioner</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Respondent</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Judge</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Court</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">List Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Source PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cases.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    No extracted cases found. Seed dummy data or run the scraper.
                  </td>
                </tr>
              ) : (
                cases.map((c, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500">{(casesPage - 1) * 25 + i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{c.main_case_no}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate" title={c.petitioner}>{c.petitioner}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate" title={c.respondent}>{c.respondent}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate" title={c.judge}>{c.judge}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{c.court_no}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{c.list_date}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[160px] truncate" title={c.source_pdf}>{c.source_pdf}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {casesTotalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-500">
              Page {casesPage} of {casesTotalPages} · {casesTotal} cases
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => fetchCases(casesPage - 1, caseSearch)}
                disabled={casesPage <= 1}
                className="p-1.5 rounded-md hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => fetchCases(casesPage + 1, caseSearch)}
                disabled={casesPage >= casesTotalPages}
                className="p-1.5 rounded-md hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const PDFsTab = () => (
    <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Filename</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Downloaded</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Size</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Cases</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Parse Time</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Deleted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {recentPdfs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No PDFs processed yet
                </td>
              </tr>
            ) : (
              recentPdfs.map((pdf, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-[250px] truncate" title={pdf.filename}>
                    {pdf.filename}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDateTime(pdf.downloaded_at)}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatBytes(pdf.file_size_bytes)}</td>
                  <td className="px-4 py-3 text-gray-900 font-medium">{pdf.cases_extracted}</td>
                  <td className="px-4 py-3 text-gray-600">{pdf.execution_time_seconds}s</td>
                  <td className="px-4 py-3">{statusBadge(pdf.parse_status)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {pdf.deleted_at ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 size={12} /> Cleaned
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  const LogsTab = () => (
    <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Run Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">PDFs Found</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Downloaded</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Skipped</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Cases</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Time</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {recentLogs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No scraper logs yet
                </td>
              </tr>
            ) : (
              recentLogs.map((log, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-900 font-medium whitespace-nowrap">{formatDateTime(log.run_date)}</td>
                  <td className="px-4 py-3 text-gray-700">{log.pdfs_found}</td>
                  <td className="px-4 py-3 text-gray-700">{log.pdfs_downloaded}</td>
                  <td className="px-4 py-3 text-gray-500">{log.pdfs_skipped}</td>
                  <td className="px-4 py-3 text-gray-900 font-medium">{log.cases_extracted}</td>
                  <td className="px-4 py-3 text-gray-600">{log.execution_time_seconds}s</td>
                  <td className="px-4 py-3">{statusBadge(log.status)}</td>
                  <td className="px-4 py-3 text-xs text-red-500 max-w-[200px] truncate">
                    {log.error_message || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────────────

  // Auth loading
  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F3F5F9]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isSignedIn) {
    return redirect("/")
  }

  // Admin check loading
  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F3F5F9]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Verifying admin access...</p>
        </div>
      </div>
    )
  }

  // Not admin — access denied
  if (isAdmin === false) {
    return (
      <div className="flex">
        <Sidebar />
        <div className={cn("bg-[#F3F5F9] flex flex-col items-center justify-center min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0", isOpen ? "lg:ml-48" : "lg:ml-12")}>
          <div className="flex flex-col items-center gap-4 max-w-md text-center px-4">
            <div className="p-4 rounded-full bg-red-50 border border-red-200">
              <ShieldAlert size={40} className="text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Access Denied</h2>
            <p className="text-muted-foreground">
              This admin panel is restricted to authorized administrators only.
              If you believe you should have access, contact your system administrator.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Button onClick={() => window.location.href = "/dashboard"} variant="outline">
                Go to Dashboard
              </Button>
              <Button
                onClick={async () => {
                  const res = await fetch("/api/scraper/promote-admin", { method: "POST" })
                  const data = await res.json()
                  if (data.success) {
                    window.location.reload()
                  } else {
                    alert(data.error || "Failed to promote. Add your email to ADMIN_EMAILS in .env.local")
                  }
                }}
                variant="outline"
                className="text-sidebar-primary border-sidebar-primary/30 hover:bg-sidebar-primary/5"
              >
                Become Admin
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              First-time setup: click &quot;Become Admin&quot; if no admins exist yet.
              Otherwise, add your email to ADMIN_EMAILS in .env.local
            </p>
          </div>
        </div>
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <Zap size={15} /> },
    { id: "cases", label: "Extracted Cases", icon: <Database size={15} /> },
    { id: "pdfs", label: "Processed PDFs", icon: <FileDown size={15} /> },
    { id: "logs", label: "Run Logs", icon: <Activity size={15} /> },
  ]

  return (
    <div className="flex">
      <Sidebar />
      <div
        className={cn(
          "bg-[#F3F5F9] flex flex-col items-start min-h-screen h-fit w-full transition-all duration-300 pb-20 lg:pb-0",
          isOpen ? "lg:ml-48" : "lg:ml-12"
        )}
      >
        <div className="w-full">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 w-full">
            <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
              <Navbar location="Admin Panel" />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
                    Admin Panel — PDF Scraper
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Admin-only dashboard · Automated Delhi HC cause list extraction
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setLoading(true); fetchStatus(); fetchCases(casesPage, caseSearch) }}
                    disabled={loading}
                    className="gap-1.5"
                  >
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSeed}
                    disabled={seeding}
                    className="gap-1.5 bg-sidebar-primary hover:bg-sidebar-primary/90"
                  >
                    {seeding ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Download size={14} />
                    )}
                    {seeding ? "Seeding..." : "Seed 3-Day Demo"}
                  </Button>
                </div>
              </div>
              {seedResult && (
                <div
                  className={cn(
                    "mt-2 px-3 py-2 rounded-lg text-sm flex items-center gap-2",
                    seedResult.startsWith("Error")
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  )}
                >
                  {seedResult.startsWith("Error") ? (
                    <AlertCircle size={14} />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  {seedResult}
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white border-b border-gray-200">
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
            {activeTab === "overview" && <OverviewTab />}
            {activeTab === "cases" && <CasesTab />}
            {activeTab === "pdfs" && <PDFsTab />}
            {activeTab === "logs" && <LogsTab />}
          </div>
        </div>
      </div>
    </div>
  )
}
