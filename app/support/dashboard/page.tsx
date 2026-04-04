"use client"

import { useCallback, useEffect, useState } from "react"
import { redirect, useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react"

type SupportStatus = "new" | "in_progress" | "resolved"
type FraudStatus = "new" | "under_review" | "investigating" | "resolved" | "dismissed"
type IssueStatus = "open" | "in_progress" | "resolved"
type SuggestionStatus = "pending" | "approved" | "rejected"

interface SupportMessageItem {
  _id: string
  name: string
  email: string
  subject: string
  message: string
  status: SupportStatus
  createdAt: string
  updatedAt: string
  handledAt?: string | null
}

interface SupportCounts {
  new: number
  in_progress: number
  resolved: number
  total: number
}

interface FraudReportItem {
  _id: string
  name: string
  email: string
  phone?: string
  incidentTitle: string
  incidentDetails: string
  incidentDate?: string | null
  caseReference?: string
  amountInvolved?: number | null
  priority: "low" | "medium" | "high"
  evidenceUrls: string[]
  status: FraudStatus
  resolutionNotes?: string
  createdAt: string
  updatedAt: string
}

interface FraudCounts {
  new: number
  under_review: number
  investigating: number
  resolved: number
  dismissed: number
  total: number
}

interface SuggestionModerationItem {
  _id: string
  title: string
  description: string
  category: string
  status: SuggestionStatus
  adminNotes: string
  ratingAverage: number
  ratingCount: number
  submitterName: string
  submitterEmail: string
  createdAt: string
  updatedAt: string
}

interface SuggestionCounts {
  pending: number
  approved: number
  rejected: number
  total: number
}

interface NotificationIssue {
  _id: string
  clerkUid: string
  title: string
  message: string
  caseTitle: string
  hearingDate: string
  channel: string
  status: string
  retryCount: number
  emailTo?: string
  error?: string
  supportIssueStatus: IssueStatus
  supportIssueNotes?: string
  createdAt: string
  updatedAt: string
}

interface NotificationIssueCounts {
  open: number
  in_progress: number
  resolved: number
  total: number
}

interface BillingIssue {
  _id: string
  userId?: string
  amount: number
  currency: string
  status: string
  paymentGateway: string
  gatewayTransactionId?: string | null
  checkoutSessionId?: string | null
  receiptUrl?: string | null
  invoiceUrl?: string | null
  failureReason?: string
  description?: string
  supportIssueStatus: IssueStatus
  supportIssueNotes?: string
  createdAt: string
  updatedAt: string
}

interface BillingIssueCounts {
  open: number
  in_progress: number
  resolved: number
  total: number
}

const defaultCounts: SupportCounts = {
  new: 0,
  in_progress: 0,
  resolved: 0,
  total: 0,
}

const defaultFraudCounts: FraudCounts = {
  new: 0,
  under_review: 0,
  investigating: 0,
  resolved: 0,
  dismissed: 0,
  total: 0,
}

const defaultSuggestionCounts: SuggestionCounts = {
  pending: 0,
  approved: 0,
  rejected: 0,
  total: 0,
}

const defaultIssueCounts: NotificationIssueCounts = {
  open: 0,
  in_progress: 0,
  resolved: 0,
  total: 0,
}

const defaultBillingCounts: BillingIssueCounts = {
  open: 0,
  in_progress: 0,
  resolved: 0,
  total: 0,
}

function formatDateTime(dateValue?: string | null) {
  if (!dateValue) return "—"

  return new Date(dateValue).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function statusStyles(status: SupportStatus) {
  if (status === "resolved") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200"
  }

  if (status === "in_progress") {
    return "bg-amber-50 text-amber-700 border-amber-200"
  }

  return "bg-blue-50 text-blue-700 border-blue-200"
}

function issueStatusStyles(status: IssueStatus) {
  if (status === "resolved") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200"
  }

  if (status === "in_progress") {
    return "bg-amber-50 text-amber-700 border-amber-200"
  }

  return "bg-blue-50 text-blue-700 border-blue-200"
}

function fraudStatusStyles(status: FraudStatus) {
  if (status === "resolved") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200"
  }

  if (status === "dismissed") {
    return "bg-gray-100 text-gray-700 border-gray-200"
  }

  if (status === "investigating") {
    return "bg-amber-50 text-amber-700 border-amber-200"
  }

  if (status === "under_review") {
    return "bg-violet-50 text-violet-700 border-violet-200"
  }

  return "bg-blue-50 text-blue-700 border-blue-200"
}

function suggestionStatusStyles(status: SuggestionStatus) {
  if (status === "approved") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200"
  }

  if (status === "rejected") {
    return "bg-red-50 text-red-700 border-red-200"
  }

  return "bg-amber-50 text-amber-700 border-amber-200"
}

function formatAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 2,
    }).format(Number(amount || 0))
  } catch {
    return `${currency || "INR"} ${Number(amount || 0).toFixed(2)}`
  }
}

export default function SupportDashboardPage() {
  const { isOpen } = useSidebar()
  const { isLoaded, isSignedIn } = useUser()
  const router = useRouter()

  const [isSupport, setIsSupport] = useState<boolean | null>(null)
  const [messages, setMessages] = useState<SupportMessageItem[]>([])
  const [counts, setCounts] = useState<SupportCounts>(defaultCounts)
  const [statusFilter, setStatusFilter] = useState<"all" | SupportStatus>("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const [fraudReports, setFraudReports] = useState<FraudReportItem[]>([])
  const [fraudCounts, setFraudCounts] = useState<FraudCounts>(defaultFraudCounts)
  const [fraudStatusFilter, setFraudStatusFilter] = useState<"all" | FraudStatus>("all")
  const [fraudSearch, setFraudSearch] = useState("")
  const [fraudLoading, setFraudLoading] = useState(true)
  const [fraudUpdatingId, setFraudUpdatingId] = useState<string | null>(null)
  const [fraudNotesById, setFraudNotesById] = useState<Record<string, string>>({})

  const [suggestions, setSuggestions] = useState<SuggestionModerationItem[]>([])
  const [suggestionCounts, setSuggestionCounts] = useState<SuggestionCounts>(defaultSuggestionCounts)
  const [suggestionStatusFilter, setSuggestionStatusFilter] = useState<"all" | SuggestionStatus>("pending")
  const [suggestionSearch, setSuggestionSearch] = useState("")
  const [suggestionLoading, setSuggestionLoading] = useState(true)
  const [suggestionUpdatingId, setSuggestionUpdatingId] = useState<string | null>(null)
  const [suggestionNotesById, setSuggestionNotesById] = useState<Record<string, string>>({})

  const [notificationIssues, setNotificationIssues] = useState<NotificationIssue[]>([])
  const [notificationIssueCounts, setNotificationIssueCounts] = useState<NotificationIssueCounts>(defaultIssueCounts)
  const [notificationIssueFilter, setNotificationIssueFilter] = useState<"all" | IssueStatus>("all")
  const [notificationSearch, setNotificationSearch] = useState("")
  const [notificationLoading, setNotificationLoading] = useState(true)
  const [notificationUpdatingId, setNotificationUpdatingId] = useState<string | null>(null)
  const [notificationNotesById, setNotificationNotesById] = useState<Record<string, string>>({})

  const [billingIssues, setBillingIssues] = useState<BillingIssue[]>([])
  const [billingIssueCounts, setBillingIssueCounts] = useState<BillingIssueCounts>(defaultBillingCounts)
  const [billingIssueFilter, setBillingIssueFilter] = useState<"all" | IssueStatus>("all")
  const [billingSearch, setBillingSearch] = useState("")
  const [billingLoading, setBillingLoading] = useState(true)
  const [billingUpdatingId, setBillingUpdatingId] = useState<string | null>(null)
  const [billingNotesById, setBillingNotesById] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isSignedIn) return

    fetch("/api/support/check")
      .then((res) => {
        if (res.ok) return res.json()
        throw new Error("not support")
      })
      .then((data) => setIsSupport(data?.isSupport === true))
      .catch(() => setIsSupport(false))
  }, [isSignedIn])

  const fetchMessages = useCallback(async () => {
    if (!isSupport) return

    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      })

      if (statusFilter !== "all") {
        params.set("status", statusFilter)
      }

      if (search.trim()) {
        params.set("search", search.trim())
      }

      const response = await fetch(`/api/support/messages?${params.toString()}`)
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to fetch support messages")
      }

      setMessages(data.messages || [])
      setCounts(data.counts || defaultCounts)
      setTotalPages(data.totalPages || 1)
    } catch (error) {
      console.error("Support dashboard fetch error:", error)
      setMessages([])
      setCounts(defaultCounts)
      setTotalPages(1)
    } finally {
      setLoading(false)
    }
  }, [isSupport, page, search, statusFilter])

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

  const fetchSuggestions = useCallback(async () => {
    if (!isSupport) return

    setSuggestionLoading(true)

    try {
      const params = new URLSearchParams({
        page: "1",
        limit: "20",
      })

      if (suggestionStatusFilter !== "all") {
        params.set("status", suggestionStatusFilter)
      }

      if (suggestionSearch.trim()) {
        params.set("search", suggestionSearch.trim())
      }

      const response = await fetch(`/api/support/suggestions?${params.toString()}`)
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to fetch suggestions")
      }

      setSuggestions(data.suggestions || [])
      setSuggestionCounts(data.counts || defaultSuggestionCounts)
      setSuggestionNotesById((prev) => {
        const next = { ...prev }
        ;(data.suggestions || []).forEach((item: SuggestionModerationItem) => {
          if (typeof next[item._id] === "undefined") {
            next[item._id] = item.adminNotes || ""
          }
        })
        return next
      })
    } catch (error) {
      console.error("Suggestions moderation fetch error:", error)
      setSuggestions([])
      setSuggestionCounts(defaultSuggestionCounts)
    } finally {
      setSuggestionLoading(false)
    }
  }, [isSupport, suggestionStatusFilter, suggestionSearch])

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

  useEffect(() => {
    if (isSupport) {
      fetchMessages()
      fetchFraudReports()
      fetchSuggestions()
      fetchNotificationIssues()
      fetchBillingIssues()
    }
  }, [
    isSupport,
    fetchMessages,
    fetchFraudReports,
    fetchSuggestions,
    fetchNotificationIssues,
    fetchBillingIssues,
  ])

  const updateStatus = async (messageId: string, status: SupportStatus) => {
    setUpdatingId(messageId)

    try {
      const response = await fetch("/api/support/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, status }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to update message status")
      }

      await fetchMessages()
    } catch (error) {
      console.error("Support status update error:", error)
    } finally {
      setUpdatingId(null)
    }
  }

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

  const updateSuggestionStatus = async (suggestionId: string, status: SuggestionStatus) => {
    setSuggestionUpdatingId(suggestionId)

    try {
      const response = await fetch("/api/support/suggestions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestionId,
          status,
          adminNotes: suggestionNotesById[suggestionId] || "",
        }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to update suggestion status")
      }

      await fetchSuggestions()
    } catch (error) {
      console.error("Suggestion status update error:", error)
    } finally {
      setSuggestionUpdatingId(null)
    }
  }

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

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F3F5F9]">
        <Loader2 className="h-8 w-8 animate-spin text-sidebar-primary" />
      </div>
    )
  }

  if (!isSignedIn) {
    return redirect("/")
  }

  if (isSupport === null) {
    return (
      <div className="flex">
        <Sidebar />
        <div className={cn("bg-[#F3F5F9] min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0", isOpen ? "lg:ml-48" : "lg:ml-12")}>
          <div className="bg-white border-b border-gray-200 w-full">
            <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
              <Navbar location="Support Panel" />
            </div>
          </div>
          <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-sidebar-primary" />
          </div>
        </div>
      </div>
    )
  }

  if (!isSupport) {
    return (
      <div className="flex">
        <Sidebar />
        <div className={cn("bg-[#F3F5F9] min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0", isOpen ? "lg:ml-48" : "lg:ml-12")}>
          <div className="bg-white border-b border-gray-200 w-full">
            <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
              <Navbar location="Support Panel" />
            </div>
          </div>
          <div className="max-w-3xl mx-auto px-4 py-16">
            <div className="bg-white border border-red-200 rounded-xl p-8 text-center">
              <ShieldAlert className="h-10 w-10 text-red-500 mx-auto mb-3" />
              <h2 className="text-xl font-semibold text-gray-900">Access denied</h2>
              <p className="text-sm text-gray-500 mt-1">Support team role is required to open this panel.</p>
              <Button className="mt-5" onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className={cn("bg-[#F3F5F9] min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0", isOpen ? "lg:ml-48" : "lg:ml-12")}>
        <div className="bg-white border-b border-gray-200 w-full">
          <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
            <Navbar location="Support Panel" />
            <div className="flex items-center gap-2 mt-1">
              <MessageSquare className="h-5 w-5 text-sidebar-primary" />
              <p className="text-sm text-gray-600">Review user submissions, fraud reports, and operational issues</p>
            </div>
          </div>
        </div>

        <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-6 space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white border border-blue-200 rounded-xl p-4">
              <p className="text-xs text-blue-600 font-medium">New Contacts</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{counts.new}</p>
            </div>
            <div className="bg-white border border-amber-200 rounded-xl p-4">
              <p className="text-xs text-amber-600 font-medium">New Fraud</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{fraudCounts.new}</p>
            </div>
            <div className="bg-white border border-emerald-200 rounded-xl p-4">
              <p className="text-xs text-emerald-600 font-medium">Open Notification Issues</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{notificationIssueCounts.open}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-600 font-medium">Open Billing Issues</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{billingIssueCounts.open}</p>
            </div>
            <div className="bg-white border border-violet-200 rounded-xl p-4 col-span-2 lg:col-span-1">
              <p className="text-xs text-violet-600 font-medium">Pending Suggestions</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{suggestionCounts.pending}</p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="grid md:grid-cols-3 gap-3">
              <div className="md:col-span-2 relative">
                <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setPage(1)
                    setSearch(e.target.value)
                  }}
                  placeholder="Search by name, email, subject, or message"
                  className="pl-9"
                />
              </div>

              <div className="flex gap-2">
                <select
                  className="flex-1 h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
                  value={statusFilter}
                  onChange={(e) => {
                    setPage(1)
                    setStatusFilter(e.target.value as "all" | SupportStatus)
                  }}
                >
                  <option value="all">All statuses</option>
                  <option value="new">New</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
                <Button variant="outline" onClick={fetchMessages}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Incoming Contact Requests</h3>
              <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
            </div>

            {loading ? (
              <div className="p-8 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-sidebar-primary" />
              </div>
            ) : messages.length === 0 ? (
              <div className="p-8 text-center">
                <Clock3 className="h-7 w-7 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-600">No messages found</p>
                <p className="text-xs text-gray-400 mt-1">Try adjusting search or status filters.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {messages.map((item) => (
                  <div key={item._id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm md:text-base">{item.subject}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.name} • {item.email} • {formatDateTime(item.createdAt)}
                        </p>
                      </div>
                      <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border", statusStyles(item.status))}>
                        {item.status.replace("_", " ")}
                      </span>
                    </div>

                    <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{item.message}</p>

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <p className="text-xs text-gray-400">
                        Last update: {formatDateTime(item.updatedAt)}
                      </p>

                      <div className="flex items-center gap-2">
                        <select
                          value={item.status}
                          className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs"
                          onChange={(e) => updateStatus(item._id, e.target.value as SupportStatus)}
                          disabled={updatingId === item._id}
                        >
                          <option value="new">New</option>
                          <option value="in_progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                        </select>
                        {updatingId === item._id && (
                          <Loader2 className="h-4 w-4 animate-spin text-sidebar-primary" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1 || loading}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages || loading}
              >
                Next
              </Button>
            </div>
          </div>

          <div className="text-xs text-gray-500 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Contact workflow with status tracking.
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Fraud Reports
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Track incident reviews, evidence, and resolution notes</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={fraudSearch}
                  onChange={(event) => setFraudSearch(event.target.value)}
                  placeholder="Search reports"
                  className="w-48 h-9"
                />
                <select
                  className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs"
                  value={fraudStatusFilter}
                  onChange={(event) => setFraudStatusFilter(event.target.value as "all" | FraudStatus)}
                >
                  <option value="all">All statuses</option>
                  <option value="new">New</option>
                  <option value="under_review">Under Review</option>
                  <option value="investigating">Investigating</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                </select>
                <Button variant="outline" onClick={fetchFraudReports}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {fraudLoading ? (
              <div className="p-8 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-sidebar-primary" />
              </div>
            ) : fraudReports.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No fraud reports found.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {fraudReports.map((item) => (
                  <div key={item._id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm md:text-base">{item.incidentTitle}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.name} • {item.email} • {formatDateTime(item.createdAt)}
                        </p>
                      </div>
                      <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border", fraudStatusStyles(item.status))}>
                        {item.status.replace("_", " ")}
                      </span>
                    </div>

                    <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{item.incidentDetails}</p>

                    <div className="grid md:grid-cols-3 gap-2 text-xs text-gray-500">
                      <p>Priority: <span className="font-medium text-gray-700 capitalize">{item.priority}</span></p>
                      <p>Case Ref: <span className="font-medium text-gray-700">{item.caseReference || "—"}</span></p>
                      <p>Amount: <span className="font-medium text-gray-700">{item.amountInvolved ? formatAmount(item.amountInvolved, "INR") : "—"}</span></p>
                    </div>

                    {item.evidenceUrls?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {item.evidenceUrls.map((url) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-sidebar-primary underline"
                          >
                            Evidence file
                          </a>
                        ))}
                      </div>
                    )}

                    <div className="grid md:grid-cols-4 gap-2 items-start">
                      <select
                        value={item.status}
                        className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs"
                        onChange={(event) => updateFraudStatus(item._id, event.target.value as FraudStatus)}
                        disabled={fraudUpdatingId === item._id}
                      >
                        <option value="new">New</option>
                        <option value="under_review">Under Review</option>
                        <option value="investigating">Investigating</option>
                        <option value="resolved">Resolved</option>
                        <option value="dismissed">Dismissed</option>
                      </select>

                      <Input
                        value={fraudNotesById[item._id] || ""}
                        onChange={(event) =>
                          setFraudNotesById((prev) => ({ ...prev, [item._id]: event.target.value }))
                        }
                        placeholder="Resolution notes"
                        className="md:col-span-3 h-9"
                        disabled={fraudUpdatingId === item._id}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-xs text-gray-500 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Fraud-report workflow includes evidence links and case status tracking.
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  Suggestion Moderation
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Approve or reject product suggestions from users</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={suggestionSearch}
                  onChange={(event) => setSuggestionSearch(event.target.value)}
                  placeholder="Search suggestions"
                  className="w-48 h-9"
                />
                <select
                  className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs"
                  value={suggestionStatusFilter}
                  onChange={(event) => setSuggestionStatusFilter(event.target.value as "all" | SuggestionStatus)}
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
                <Button variant="outline" onClick={fetchSuggestions}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {suggestionLoading ? (
              <div className="p-8 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-sidebar-primary" />
              </div>
            ) : suggestions.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No suggestions found for the selected filters.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {suggestions.map((item) => (
                  <div key={item._id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm md:text-base">{item.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.submitterName} • {item.submitterEmail || "No email"} • {item.category}
                        </p>
                      </div>
                      <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border", suggestionStatusStyles(item.status))}>
                        {item.status}
                      </span>
                    </div>

                    <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{item.description}</p>
                    <p className="text-xs text-gray-500">
                      Rating: {item.ratingAverage.toFixed(1)} ({item.ratingCount} total)
                    </p>

                    <div className="grid md:grid-cols-4 gap-2 items-start">
                      <select
                        value={item.status}
                        className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs"
                        onChange={(event) => updateSuggestionStatus(item._id, event.target.value as SuggestionStatus)}
                        disabled={suggestionUpdatingId === item._id}
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>

                      <Input
                        value={suggestionNotesById[item._id] || ""}
                        onChange={(event) =>
                          setSuggestionNotesById((prev) => ({ ...prev, [item._id]: event.target.value }))
                        }
                        placeholder="Moderation note"
                        className="md:col-span-3 h-9"
                        disabled={suggestionUpdatingId === item._id}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <BellRing className="h-4 w-4 text-orange-500" />
                  Failed Notification Workflow
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Retry or resolve failed email reminders</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={notificationSearch}
                  onChange={(event) => setNotificationSearch(event.target.value)}
                  placeholder="Search failed notifications"
                  className="w-56 h-9"
                />
                <select
                  className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs"
                  value={notificationIssueFilter}
                  onChange={(event) => setNotificationIssueFilter(event.target.value as "all" | IssueStatus)}
                >
                  <option value="all">All issue statuses</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
                <Button variant="outline" onClick={fetchNotificationIssues}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {notificationLoading ? (
              <div className="p-8 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-sidebar-primary" />
              </div>
            ) : notificationIssues.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No failed notifications found.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notificationIssues.map((item) => (
                  <div key={item._id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm md:text-base">{item.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.caseTitle || "Case reminder"} • {item.emailTo || "No target email"}
                        </p>
                      </div>
                      <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border", issueStatusStyles(item.supportIssueStatus))}>
                        {item.supportIssueStatus.replace("_", " ")}
                      </span>
                    </div>

                    <p className="text-sm text-gray-700">{item.message}</p>
                    <p className="text-xs text-red-600">Error: {item.error || "Unknown delivery error"}</p>

                    <div className="grid md:grid-cols-5 gap-2 items-start">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retryNotificationIssue(item._id)}
                        disabled={notificationUpdatingId === item._id}
                      >
                        Retry
                      </Button>

                      <select
                        value={item.supportIssueStatus}
                        className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs"
                        onChange={(event) =>
                          updateNotificationIssueStatus(item._id, event.target.value as IssueStatus)
                        }
                        disabled={notificationUpdatingId === item._id}
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                      </select>

                      <Input
                        value={notificationNotesById[item._id] || ""}
                        onChange={(event) =>
                          setNotificationNotesById((prev) => ({ ...prev, [item._id]: event.target.value }))
                        }
                        placeholder="Issue notes"
                        className="md:col-span-3 h-9"
                        disabled={notificationUpdatingId === item._id}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-violet-500" />
                  Billing Issue Workflow
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Review failed/pending transaction issues</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={billingSearch}
                  onChange={(event) => setBillingSearch(event.target.value)}
                  placeholder="Search billing issues"
                  className="w-56 h-9"
                />
                <select
                  className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs"
                  value={billingIssueFilter}
                  onChange={(event) => setBillingIssueFilter(event.target.value as "all" | IssueStatus)}
                >
                  <option value="all">All issue statuses</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
                <Button variant="outline" onClick={fetchBillingIssues}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {billingLoading ? (
              <div className="p-8 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-sidebar-primary" />
              </div>
            ) : billingIssues.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No billing issues found.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {billingIssues.map((item) => (
                  <div key={item._id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm md:text-base">
                          {formatAmount(item.amount, item.currency || "INR")} • {item.paymentGateway}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.gatewayTransactionId || item.checkoutSessionId || "No gateway id"} • {formatDateTime(item.createdAt)}
                        </p>
                      </div>
                      <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border", issueStatusStyles(item.supportIssueStatus))}>
                        {item.supportIssueStatus.replace("_", " ")}
                      </span>
                    </div>

                    <p className="text-sm text-gray-700">{item.description || "No description"}</p>
                    <p className="text-xs text-red-600">Failure reason: {item.failureReason || "N/A"}</p>

                    <div className="grid md:grid-cols-4 gap-2 items-start">
                      <select
                        value={item.supportIssueStatus}
                        className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs"
                        onChange={(event) =>
                          updateBillingIssueStatus(item._id, event.target.value as IssueStatus)
                        }
                        disabled={billingUpdatingId === item._id}
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                      </select>

                      <Input
                        value={billingNotesById[item._id] || ""}
                        onChange={(event) =>
                          setBillingNotesById((prev) => ({ ...prev, [item._id]: event.target.value }))
                        }
                        placeholder="Issue notes"
                        className="md:col-span-3 h-9"
                        disabled={billingUpdatingId === item._id}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-xs text-gray-500 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Support workflows now cover contact, fraud, failed notifications, billing issues, and suggestions moderation.
          </div>
        </div>
      </div>
    </div>
  )
}
