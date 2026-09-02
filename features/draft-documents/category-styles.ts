import {
  Briefcase,
  FileText,
  Handshake,
  Home,
  Mail,
  ShieldCheck,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import type { DocumentCategory } from "@/lib/document-categories"

type CategoryStyle = { color: string; bgColor: string; icon: LucideIcon }

export const categoryStyles: Record<DocumentCategory, CategoryStyle> = {
  "Rental & Lease": {
    color: "text-brand-700 dark:text-brand-400",
    bgColor: "bg-brand-50 dark:bg-brand-500/10",
    icon: Home,
  },
  "Service Agreements": {
    color: "text-violet-700 dark:text-violet-400",
    bgColor: "bg-violet-50 dark:bg-violet-500/10",
    icon: Wrench,
  },
  Employment: {
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-500/10",
    icon: UserRound,
  },
  "NDAs & Confidentiality": {
    color: "text-orange-700 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-500/10",
    icon: ShieldCheck,
  },
  "Corporate & Business": {
    color: "text-slate-700 dark:text-slate-300",
    bgColor: "bg-slate-100 dark:bg-slate-500/10",
    icon: Briefcase,
  },
  "Consumer Protection": {
    color: "text-rose-700 dark:text-rose-400",
    bgColor: "bg-rose-50 dark:bg-rose-500/10",
    icon: Handshake,
  },
  "Notices & Letters": {
    color: "text-amber-700 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-500/10",
    icon: Mail,
  },
  "Other Documents": {
    color: "text-indigo-700 dark:text-indigo-400",
    bgColor: "bg-indigo-50 dark:bg-indigo-500/10",
    icon: FileText,
  },
}

const fallback: CategoryStyle = {
  color: "text-gray-600 dark:text-gray-300",
  bgColor: "bg-gray-100 dark:bg-gray-500/10",
  icon: FileText,
}

export function styleFor(category: string | null | undefined): CategoryStyle {
  if (!category) return fallback
  return categoryStyles[category as DocumentCategory] || fallback
}
