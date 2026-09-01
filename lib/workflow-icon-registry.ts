import type { ComponentType } from "react"
import {
  Bell,
  CheckCircle2,
  CreditCard,
  Database,
  FileEdit,
  Gavel,
  Mail,
  Quote,
  ScanText,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Upload,
  UserCheck,
  Webhook,
  type LucideIcon,
} from "lucide-react"

/** Keys the AI is allowed to pick from when it proposes a workflow step. */
export const WORKFLOW_ICON_KEYS = [
  "upload",
  "scan-text",
  "gavel",
  "shield-alert",
  "quote",
  "file-edit",
  "mail",
  "user-check",
  "sparkles",
  "send",
  "check-circle",
  "bell",
  "database",
  "webhook",
  "search",
  "credit-card",
] as const

export type WorkflowIconKey = (typeof WORKFLOW_ICON_KEYS)[number]

export const WORKFLOW_ICON_MAP: Record<WorkflowIconKey, LucideIcon> = {
  upload: Upload,
  "scan-text": ScanText,
  gavel: Gavel,
  "shield-alert": ShieldAlert,
  quote: Quote,
  "file-edit": FileEdit,
  mail: Mail,
  "user-check": UserCheck,
  sparkles: Sparkles,
  send: Send,
  "check-circle": CheckCircle2,
  bell: Bell,
  database: Database,
  webhook: Webhook,
  search: Search,
  "credit-card": CreditCard,
}

export const WORKFLOW_COLOR_KEYS = ["emerald", "blue", "amber", "purple", "indigo"] as const

export type WorkflowColorKey = (typeof WORKFLOW_COLOR_KEYS)[number]

/** Reverse lookup so a node already on the canvas can be sent back to the AI as a key. */
export function iconKeyFor(icon: ComponentType<{ className?: string }>): WorkflowIconKey {
  const found = (Object.entries(WORKFLOW_ICON_MAP) as [WorkflowIconKey, LucideIcon][]).find(
    ([, component]) => (component as unknown) === icon
  )
  return found ? found[0] : "sparkles"
}
