import {
  Activity, CheckCircle2, CreditCard, FileSearch, FileStack, FileText,
  Gavel, LayoutDashboard, Loader2, RefreshCw, Shield, UploadCloud, Users, XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { TabDefinition } from "./types"

export const tabs: TabDefinition[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "users", label: "Users", icon: Users },
  { id: "transactions", label: "Transactions", icon: CreditCard },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "templates", label: "Document Templates", icon: FileStack },
  { id: "logs", label: "Logs", icon: Activity },
  { id: "causelist", label: "Cause List Parser", icon: FileSearch },
  { id: "rag", label: "Knowledge Base", icon: UploadCloud },
  { id: "sci-scraper", label: "SC Judgment Scraper", icon: Gavel },
]

export function formatDate(iso: string) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

export function formatDateTime(iso: string) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

export function formatCurrency(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatBytes(bytes: number) {
  if (!bytes) return "—"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    completed: { bg: "bg-brand-50 border-brand-200", text: "text-brand-700", icon: <CheckCircle2 size={12} /> },
    success: { bg: "bg-brand-50 border-brand-200", text: "text-brand-700", icon: <CheckCircle2 size={12} /> },
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

export function roleBadge(role: string) {
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

export function openDocument(filePath: string) {
  if (!filePath) return

  const target = filePath.startsWith("http")
    ? filePath
    : filePath.startsWith("/")
      ? filePath
      : `/${filePath}`

  window.open(target, "_blank", "noopener,noreferrer")
}
