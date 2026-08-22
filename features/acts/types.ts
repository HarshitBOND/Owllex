export type Act = {
  _id: string
  actName: string
  actYear?: string
  actNo?: string
  category?: string
  url?: string
}

export type ActsResponse = {
  success?: boolean
  acts?: Act[]
  data?: Act[]
  hasMore?: boolean
  availableCategories?: string[]
}
