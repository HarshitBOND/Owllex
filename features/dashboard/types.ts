export type MobileSection = "overview" | "calendar" | "tasks" | "activity"

export interface DashboardData {
  stats: {
    totalCases: number
    totalClients: number
    pendingTasks: number
    completedTasks: number
    upcomingHearings: number
  }
  recentCases: any[]
  recentClients: any[]
  recentTasks: any[]
  upcomingHearings: any[]
  subscription: {
    plan: string
    status: string
    billingCycle: string
    caseLimit: number | null
    casesUsed: number
    casesRemaining: number | null
    isPaidPlan: boolean
    features: {
      parserUpload: boolean
      advancedAutomation: boolean
      prioritySupport: boolean
    }
    renewalDate: string | null
    cancelAtPeriodEnd: boolean
  } | null
  analytics: {
    overdueTasks: number
    tasksDueNext7Days: number
    hearingsNext30Days: number
    outstandingInvoices: number
    overdueInvoices: number
    recentFailedTransactions: number
  }
  billing: {
    totalOutstanding: number
    overdueOutstanding: number
    collectedThisMonth: number
    openBillingIssues: number
    recentTransactions: any[]
  }
  activityFeed: any[]
  operations: {
    automationEnabled: boolean
    recentJobs: any[]
  }
}

export interface StatCardDefinition {
  name: string
  value: number
  icon: import("lucide-react").LucideIcon
  color: string
  bgColor: string
  borderColor: string
  description: string
  href: string
}

export interface QuickActionDefinition {
  name: string
  description: string
  icon: import("lucide-react").LucideIcon
  href: string
  color: string
}
