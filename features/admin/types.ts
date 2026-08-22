import type { LucideIcon } from "lucide-react"

export interface DashboardStats {
  totalUsers: number
  totalTransactions: number
  totalRevenue: number
  totalDocuments: number
  totalAdminLogs: number
  activeUsers: number
  bannedUsers: number
  pendingTransactions: number
}

export interface UserRecord {
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

export interface TransactionRecord {
  _id: string
  userId: { _id: string; firstName: string; lastName: string; email: string } | null
  amount: number
  status: string
  paymentGateway: string
  receiptUrl?: string | null
  invoiceUrl?: string | null
  failureReason?: string | null
  description: string
  currency: string
  createdAt: string
}

export interface DocumentRecord {
  _id: string
  userId: { _id: string; firstName: string; lastName: string; email: string } | null
  documentType: string
  title: string
  filePath: string
  fileSize: number
  createdAt: string
}

export interface AdminLogRecord {
  _id: string
  adminId: { _id: string; firstName: string; lastName: string; email: string } | null
  action: string
  targetType: string
  details: string
  ipAddress: string
  createdAt: string
}

export type Tab = "dashboard" | "users" | "transactions" | "documents" | "logs" | "causelist"

export interface TabDefinition {
  id: Tab
  label: string
  icon: LucideIcon
}

export interface CauselistStatus {
  last_import?: {
    run_date?: string
    status?: string
    pdfs_found?: number
    pdfs_downloaded?: number
    cases_extracted?: number
  }
  last_checkpoint?: {
    checkpoint_identifier?: string
    last_processed_timestamp?: string
  }
  current_session?: {
    import_id?: string
    started_at?: string
  }
}

export interface CauselistProgressEntry {
  status?: string
  message?: string
}

export interface CauselistSummary {
  status?: string
  pdfs_found?: number
  pdfs_processed?: number
  cases_parsed?: number
  errors?: number
  execution_time_seconds?: number
}
