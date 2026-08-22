export type SupportStatus = "new" | "in_progress" | "resolved"
export type FraudStatus = "new" | "under_review" | "investigating" | "resolved" | "dismissed"
export type IssueStatus = "open" | "in_progress" | "resolved"
export type SuggestionStatus = "pending" | "approved" | "rejected"

export interface SupportMessageItem {
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

export interface SupportCounts {
  new: number
  in_progress: number
  resolved: number
  total: number
}

export interface FraudReportItem {
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

export interface FraudCounts {
  new: number
  under_review: number
  investigating: number
  resolved: number
  dismissed: number
  total: number
}

export interface SuggestionModerationItem {
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

export interface SuggestionCounts {
  pending: number
  approved: number
  rejected: number
  total: number
}

export interface NotificationIssue {
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

export interface NotificationIssueCounts {
  open: number
  in_progress: number
  resolved: number
  total: number
}

export interface BillingIssue {
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

export interface BillingIssueCounts {
  open: number
  in_progress: number
  resolved: number
  total: number
}
