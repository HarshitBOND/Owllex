import type { TemplateField } from "@/lib/templates/fields"

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

export type SubscriptionPlan = "trial" | "starter" | "professional" | "enterprise"

export const SUBSCRIPTION_PLAN_OPTIONS: SubscriptionPlan[] = ["trial", "starter", "professional", "enterprise"]

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
  subscription?: { plan?: SubscriptionPlan }
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

export interface DocumentTemplateRecord {
  _id: string
  title: string
  slug: string
  description: string
  category: string
  // "archived" is what a superseded or still-referenced template becomes.
  // Deleting one would orphan every draft made from it.
  status: "draft" | "published" | "archived"
  usageCount: number
  bodyHtml?: string
  fields?: TemplateField[]
  latestVersion?: number
  supersededBy?: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface TemplateVersionSummary {
  _id: string
  version: number
  changeNote: string
  renderMode: "html" | "pdf-overlay"
  publishedAt: string | null
  createdAt: string
}

export type Tab =
  | "dashboard"
  | "users"
  | "transactions"
  | "documents"
  | "templates"
  | "logs"
  | "causelist"
  | "rag"
  | "sci-scraper"
  | "ai-usage"

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

export type RagIngestStatus = "pending" | "uploading" | "success" | "failed"

export interface RagIngestItem {
  id: string
  file: File
  // Present only for a multi-page photo group, ordered front-to-back. file === pages[0].
  pages?: File[]
  status: RagIngestStatus
  error?: string
  documentId?: string
  title?: string
  documentType?: string
  chunkCount?: number
  // Backend recognised the content hash as already indexed and rejected this upload.
  duplicate?: boolean
}

export interface RagStatus {
  ready: boolean
  openai_key_configured: boolean
  chroma_configured: boolean
  dependencies_installed: boolean
  chunk_count: number
  document_count: number
  indexed_hashes: number
  chroma_database: string | null
  error: string | null
}

export interface RagSearchResult {
  text: string
  score: number
  document_id?: string
  title?: string
  document_type?: string
  date?: string
}

export type SciScraperStatus = "starting" | "waiting_for_captcha" | "downloading" | "completed" | "failed"

export interface SciScraperJob {
  status: SciScraperStatus
  requested: number
  downloaded: number
  ingested: number
  log: string[]
  error: string | null
  startedAt: string
  finishedAt: string | null
}
