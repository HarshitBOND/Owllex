export type NoticeState = {
  kind: "success" | "error"
  message: string
} | null

export interface AccountSettingsState {
  firstName: string
  lastName: string
  email: string
  defaultLandingPage: "/dashboard" | "/case-tracking" | "/tasks" | "/invoices"
  weeklyDigestEnabled: boolean
  showBillingSummary: boolean
}

export interface NotificationPreferencesState {
  emailEnabled: boolean
  timezone: string
  sendWindowStartHour: number
  sendWindowEndHour: number
  reminderOffsets: number[]
}

export interface SubscriptionState {
  plan: string
  status: string
  billingCycle: string
  caseLimit: number | null
  casesUsed: number
  casesRemaining: number | null
  renewalDate: string | null
  cancelAtPeriodEnd: boolean
}

export interface BillingTransaction {
  _id: string
  amount: number
  currency: string
  status: string
  paymentGateway: string
  description?: string
  failureReason?: string
  receiptUrl?: string | null
  invoiceUrl?: string | null
  createdAt: string
}
