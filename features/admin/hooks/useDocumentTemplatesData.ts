import { useCallback, useState } from "react"
import { toast } from "sonner"
import type { TemplateField } from "@/lib/templates/fields"
import type { DocumentTemplateRecord } from "../types"

export type TemplateInput = {
  title: string
  description: string
  category: string
  bodyHtml: string
  fields: TemplateField[]
  status: "draft" | "published"
  changeNote?: string
}

export function useDocumentTemplatesData() {
  const [templates, setTemplates] = useState<DocumentTemplateRecord[]>([])
  const [tplTotal, setTplTotal] = useState(0)
  const [tplPage, setTplPage] = useState(1)
  const [tplTotalPages, setTplTotalPages] = useState(1)
  const [tplSearch, setTplSearch] = useState("")
  const [tplCategoryFilter, setTplCategoryFilter] = useState("")
  const [tplStatusFilter, setTplStatusFilter] = useState("")
  const [savingId, setSavingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchTemplates = useCallback(
    async (page = 1) => {
      try {
        setLoading(true)
        const p = new URLSearchParams({ page: String(page), limit: "20" })
        if (tplSearch) p.set("search", tplSearch)
        if (tplCategoryFilter) p.set("category", tplCategoryFilter)
        if (tplStatusFilter) p.set("status", tplStatusFilter)
        const res = await fetch(`/api/admin/document-templates?${p}`)
        const data = await res.json()
        if (data.success) {
          setTemplates(data.templates)
          setTplTotal(data.total)
          setTplPage(data.page)
          setTplTotalPages(data.totalPages)
        }
      } catch (err) {
        console.error("Templates fetch error:", err)
      } finally {
        setLoading(false)
      }
    },
    [tplSearch, tplCategoryFilter, tplStatusFilter]
  )

  const loadTemplate = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/document-templates/${id}`)
    const data = await res.json()
    if (!data.success) {
      toast.error(data.error || "Could not load the template")
      return null
    }
    return data.template as DocumentTemplateRecord
  }, [])

  const createTemplate = useCallback(
    async (input: TemplateInput) => {
      setSavingId("new")
      try {
        const res = await fetch("/api/admin/document-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        })
        const data = await res.json()
        if (!data.success) {
          toast.error(data.error || "Could not create the template")
          return false
        }
        toast.success(input.status === "published" ? "Template published" : "Template saved as draft")
        await fetchTemplates(1)
        return true
      } finally {
        setSavingId(null)
      }
    },
    [fetchTemplates]
  )

  const updateTemplate = useCallback(
    async (id: string, patch: Partial<TemplateInput>) => {
      setSavingId(id)
      try {
        const res = await fetch(`/api/admin/document-templates/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
        const data = await res.json()
        if (!data.success) {
          toast.error(data.error || "Could not update the template")
          return false
        }
        toast.success("Template updated")
        await fetchTemplates(tplPage)
        return true
      } finally {
        setSavingId(null)
      }
    },
    [fetchTemplates, tplPage]
  )

  const togglePublish = useCallback(
    async (id: string, next: "draft" | "published") => {
      setSavingId(id)
      try {
        const res = await fetch(`/api/admin/document-templates/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        })
        const data = await res.json()
        if (!data.success) {
          toast.error(data.error || "Could not change the status")
          return
        }
        toast.success(next === "published" ? "Template published" : "Template unpublished")
        await fetchTemplates(tplPage)
      } finally {
        setSavingId(null)
      }
    },
    [fetchTemplates, tplPage]
  )

  const deleteTemplate = useCallback(
    async (id: string) => {
      setSavingId(id)
      try {
        const res = await fetch(`/api/admin/document-templates/${id}`, { method: "DELETE" })
        const data = await res.json()
        if (!data.success) {
          toast.error(data.error || "Could not delete the template")
          return
        }
        // A template other documents were drafted from is archived, not
        // deleted -- the server says which happened and why.
        if (data.archived) {
          toast.success("Template archived", { description: data.message })
        } else {
          toast.success("Template deleted")
        }
        await fetchTemplates(tplPage)
      } finally {
        setSavingId(null)
      }
    },
    [fetchTemplates, tplPage]
  )

  return {
    templates,
    tplTotal,
    tplPage,
    tplTotalPages,
    tplSearch,
    setTplSearch,
    tplCategoryFilter,
    setTplCategoryFilter,
    tplStatusFilter,
    setTplStatusFilter,
    savingId,
    loading,
    fetchTemplates,
    loadTemplate,
    createTemplate,
    updateTemplate,
    togglePublish,
    deleteTemplate,
  }
}
