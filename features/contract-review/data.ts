export type IssueSeverity = "critical" | "warning" | "suggestion" | "info"

export type ContractIssue = {
  id: string
  severity: IssueSeverity
  title: string
  description: string
  quote: string
  redline: string
}

export type ContractSummary = {
  riskLevel: "Low" | "Medium" | "High"
  summary: string
  recommendations: string[]
}

export type ContractFileMeta = {
  name: string
  size: number
  uploadedLabel: string
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

export const fontFamilies = [
  { label: "Averia Serif Libre", value: "var(--font-averia-serif-libre), Georgia, serif" },
  { label: "Georgia", value: "Georgia" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Arial", value: "Arial" },
  { label: "Inter", value: "var(--font-inter), Inter, sans-serif" },
]

export const fontSizes = [10, 11, 12, 14, 16, 18]

export const DEFAULT_TYPOGRAPHY = { fontFamily: fontFamilies[0].value, fontSizePt: 12 }

// Uploaded through the exact same /api/contract-review pipeline as a real file
// (as a .md attachment) so "try a sample" exercises real extraction + real AI review,
// not a second mocked code path.
export const SAMPLE_CONTRACT_MARKDOWN = `# SERVICE AGREEMENT

This Service Agreement ("Agreement") is made and entered into by and between Acme Consulting ("Consultant") and the Client.

### 1. Services

The Consultant agrees to provide the services described in Exhibit A.

### 2. Payment Terms

The Client shall pay the Consultant a total fee of $50,000. Payment shall be made within 60 days of invoice.

### 3. Term and Termination

This Agreement shall commence on the Effective Date and continue for 12 months. Either party may terminate this Agreement upon written notice.

### 4. Limitation of Liability

Neither party shall be liable for any indirect, incidental, or consequential damages arising out of or related to this Agreement.

### 5. Governing Law

This Agreement shall be governed by the laws of the State of California.
`
