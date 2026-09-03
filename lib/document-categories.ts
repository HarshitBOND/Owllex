export const DOCUMENT_CATEGORIES = [
  "Rental & Lease",
  "Service Agreements",
  "Employment",
  "NDAs & Confidentiality",
  "Corporate & Business",
  "Consumer Protection",
  "Notices & Letters",
  "Court Forms & Pleadings",
  "Other Documents",
] as const

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

export function isDocumentCategory(value: string): value is DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value)
}
