import type { LucideIcon } from "lucide-react"

export interface AffidavitTemplate {
  id: string
  name: string
  description: string
  icon: LucideIcon
  color: string
  bgColor: string
  fields: string[]
}

export type FormValues = Record<string, string>
