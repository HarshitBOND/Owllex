export type IssueSeverity = "critical" | "warning" | "suggestion" | "info"

export type ContractIssue = {
  id: string
  badge: number
  severity: IssueSeverity
  title: string
  description: string
  page: number
  clause: number
}

export const severityStyles: Record<
  IssueSeverity,
  {
    label: string
    dot: string
    badgeBg: string
    badgeText: string
    badgeBorder: string
    highlightBg: string
    ringColor: string
  }
> = {
  critical: {
    label: "Critical",
    dot: "bg-red-500",
    badgeBg: "bg-red-50 dark:bg-red-500/10",
    badgeText: "text-red-600 dark:text-red-400",
    badgeBorder: "border-red-200 dark:border-red-500/30",
    highlightBg: "bg-red-100/70 dark:bg-red-500/15",
    ringColor: "ring-red-400",
  },
  warning: {
    label: "Warning",
    dot: "bg-orange-500",
    badgeBg: "bg-orange-50 dark:bg-orange-500/10",
    badgeText: "text-orange-600 dark:text-orange-400",
    badgeBorder: "border-orange-200 dark:border-orange-500/30",
    highlightBg: "bg-orange-100/70 dark:bg-orange-500/15",
    ringColor: "ring-orange-400",
  },
  suggestion: {
    label: "Suggestion",
    dot: "bg-blue-500",
    badgeBg: "bg-blue-50 dark:bg-blue-500/10",
    badgeText: "text-blue-600 dark:text-blue-400",
    badgeBorder: "border-blue-200 dark:border-blue-500/30",
    highlightBg: "bg-blue-100/70 dark:bg-blue-500/15",
    ringColor: "ring-blue-400",
  },
  info: {
    label: "Info",
    dot: "bg-slate-400",
    badgeBg: "bg-slate-100 dark:bg-slate-500/10",
    badgeText: "text-slate-600 dark:text-slate-400",
    badgeBorder: "border-slate-200 dark:border-slate-500/30",
    highlightBg: "bg-slate-100/70 dark:bg-slate-500/15",
    ringColor: "ring-slate-400",
  },
}

export const mockIssues: ContractIssue[] = [
  {
    id: "i1",
    badge: 1,
    severity: "critical",
    title: "Missing definition",
    description: "Exhibit A is referenced but not attached.",
    page: 1,
    clause: 1,
  },
  {
    id: "i2",
    badge: 2,
    severity: "critical",
    title: "Unfavorable payment terms",
    description: "60 days payment term is too long and may impact cash flow.",
    page: 1,
    clause: 2,
  },
  {
    id: "i3",
    badge: 3,
    severity: "warning",
    title: "Termination clause too broad",
    description: 'Allows termination "upon written notice" without specifying notice period or reason.',
    page: 1,
    clause: 3,
  },
  {
    id: "i4",
    badge: 4,
    severity: "critical",
    title: "Limitation of liability too broad",
    description: "This clause may not be enforceable in your jurisdiction.",
    page: 1,
    clause: 4,
  },
  {
    id: "i5",
    badge: 5,
    severity: "suggestion",
    title: "Governing law",
    description: "Consider aligning governing law with the location of performance or dispute resolution.",
    page: 1,
    clause: 5,
  },
]

export const summaryStats = {
  issues: 12,
  warnings: 7,
  suggestions: 3,
  info: 2,
}

export const issueTabs = [
  { key: "all", label: "All issues", count: 12 },
  { key: "critical", label: "Critical", count: 3 },
  { key: "warning", label: "Warnings", count: 7 },
  { key: "suggestion", label: "Suggestions", count: 3 },
] as const

export type FixSuggestion = {
  fixedText: string
  note: string
}

export const fixSuggestions: Record<string, FixSuggestion> = {
  i2: {
    fixedText: "Payment shall be made within 30 days of invoice.",
    note: "Shortened the payment term from 60 to 30 days to protect cash flow.",
  },
  i3: {
    fixedText: "Either party may terminate this Agreement upon 30 days' written notice.",
    note: "Added a defined 30-day notice period to the termination clause.",
  },
  i4: {
    fixedText:
      "Neither party shall be liable for any indirect, incidental, or consequential damages arising out of or related to this Agreement, except in cases of gross negligence or willful misconduct.",
    note: "Added a carve-out for gross negligence and willful misconduct so the clause holds up under review.",
  },
  i5: {
    fixedText: "This Agreement shall be governed by the laws of the state in which the Services are performed.",
    note: "Aligned governing law with the location where the services are performed.",
  },
}

export type ContractFileMeta = {
  name: string
  pages: number
  uploadedLabel: string
}

export const defaultFileMeta: ContractFileMeta = {
  name: "Service_Agreement_Acme_Consulting.pdf",
  pages: 12,
  uploadedLabel: "Uploaded 2 mins ago",
}

export const aiInsightsSummary = {
  riskLevel: "Medium" as const,
  summary:
    "This service agreement contains a few clauses that favor the counterparty and one missing exhibit. Payment terms and liability language are the biggest areas to negotiate before signing.",
  recommendations: [
    "Request Exhibit A before execution — the scope of services is not otherwise defined.",
    "Negotiate payment terms down from 60 to 30 days to protect cash flow.",
    "Add a defined notice period (e.g. 30 days) to the termination clause.",
    "Review the limitation of liability clause against your governing law's enforceability rules.",
  ],
}
