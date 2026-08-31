export type CorpusSummary = {
  id: string
  name: string
  description: string
  accent: string
  archived: boolean
  caseCount: number
  clientCount: number
  documentCount: number
  chatCount: number
  createdAt: number
  updatedAt: number
}

export type CorpusDocument = {
  id: string
  filename: string
  mimeType: string
  size: number
  status: "pending" | "indexing" | "ready" | "failed"
  chunkCount: number
  error: string
  createdAt: number
}

export type CorpusDetail = {
  id: string
  name: string
  description: string
  instructions: string
  accent: string
  archived: boolean
  createdAt: number
  updatedAt: number
  cases: any[]
  clients: any[]
  documents: CorpusDocument[]
}
