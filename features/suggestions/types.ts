export type SuggestionStatus = "pending" | "approved" | "rejected"

export interface SuggestionItem {
  _id: string
  title: string
  description: string
  category: string
  status: SuggestionStatus
  adminNotes: string
  ratingAverage: number
  ratingCount: number
  myRating: number | null
  isMine: boolean
  createdAt: string
}

export type SuggestionNotice = { kind: "success" | "error"; text: string } | null

export interface SuggestionFormData {
  title: string
  description: string
  category: string
}
