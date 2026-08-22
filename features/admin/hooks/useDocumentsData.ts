import { useCallback, useState } from "react"
import type { DocumentRecord } from "../types"

export function useDocumentsData() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [docsTotal, setDocsTotal] = useState(0)
  const [docsPage, setDocsPage] = useState(1)
  const [docsTotalPages, setDocsTotalPages] = useState(1)
  const [docsSearch, setDocsSearch] = useState("")
  const [docsTypeFilter, setDocsTypeFilter] = useState("")

  const fetchDocuments = useCallback(async (page = 1) => {
    try {
      const p = new URLSearchParams({ page: String(page), limit: "20" })
      if (docsSearch) p.set("search", docsSearch)
      if (docsTypeFilter) p.set("type", docsTypeFilter)
      const res = await fetch(`/api/admin/documents?${p}`)
      const data = await res.json()
      if (data.success) {
        setDocuments(data.documents)
        setDocsTotal(data.total)
        setDocsPage(data.page)
        setDocsTotalPages(data.totalPages)
      }
    } catch (err) {
      console.error("Documents fetch error:", err)
    }
  }, [docsSearch, docsTypeFilter])

  return {
    documents,
    docsTotal,
    docsPage,
    docsTotalPages,
    docsSearch,
    setDocsSearch,
    docsTypeFilter,
    setDocsTypeFilter,
    fetchDocuments,
  }
}
