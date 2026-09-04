"use client"

import { useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { ExternalLink, FileWarning, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DOCUMENT_CATEGORIES } from "@/lib/document-categories"
import { validateTokenParity, type TemplateField } from "@/lib/templates/fields"
import { TemplateFieldsEditor } from "./TemplateFieldsEditor"

const TemplateBodyEditor = dynamic(() => import("./TemplateBodyEditor"), {
  ssr: false,
  loading: () => (
    <div className="h-[320px] flex items-center justify-center rounded-lg border-2 border-gray-200 dark:border-gray-700">
      <div className="w-6 h-6 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
    </div>
  ),
})

/**
 * The review an imported template has to pass before anyone can use it.
 *
 * The court's own PDF sits on the left throughout, because the only useful
 * check on a machine reconstruction of a legal form is reading it against the
 * original. Publishing is a separate, deliberate action from saving.
 */
export function TemplateReviewDialog({
  open,
  templateId,
  initial,
  initialParityErrors,
  onClose,
  onSaved,
}: {
  open: boolean
  templateId: string | null
  initial: {
    title: string
    description: string
    category: string
    bodyHtml: string
    fields: TemplateField[]
  } | null
  initialParityErrors?: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<string>(DOCUMENT_CATEGORIES[0])
  const [bodyHtml, setBodyHtml] = useState("")
  const [fields, setFields] = useState<TemplateField[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const [pdfUrl, setPdfUrl] = useState("")
  const [pdfError, setPdfError] = useState("")
  const [pdfLoading, setPdfLoading] = useState(false)

  useEffect(() => {
    if (!open || !initial) return
    setTitle(initial.title)
    setDescription(initial.description)
    setCategory(initial.category)
    setBodyHtml(initial.bodyHtml)
    setFields(initial.fields)
    setError("")
  }, [open, initial])

  useEffect(() => {
    if (!open || !templateId) return
    let cancelled = false
    setPdfLoading(true)
    setPdfError("")
    fetch(`/api/admin/document-templates/${templateId}/source`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.success) setPdfUrl(data.url)
        else setPdfError(data.error || "The original PDF could not be opened.")
      })
      .catch(() => !cancelled && setPdfError("The original PDF could not be opened."))
      .finally(() => !cancelled && setPdfLoading(false))
    return () => {
      cancelled = true
    }
  }, [open, templateId])

  // Recomputed as the admin edits, so fixing a token clears the warning in
  // place instead of only at save time.
  const parityErrors = validateTokenParity(bodyHtml, fields)
  const canPublish = parityErrors.length === 0 && title.trim().length >= 2

  const save = useCallback(
    async (status: "draft" | "published") => {
      if (!templateId) return
      if (title.trim().length < 2) {
        setError("Give the template a title of at least 2 characters.")
        return
      }
      if (status === "published" && parityErrors.length > 0) {
        setError("The body and the field list have to agree before this can be published.")
        return
      }

      setSaving(true)
      setError("")
      try {
        const res = await fetch(`/api/admin/document-templates/${templateId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            category,
            bodyHtml,
            fields,
            status,
            changeNote: "Reviewed after import",
          }),
        })
        const data = await res.json()
        if (!data.success) {
          setError(data.error || "Could not save the template.")
          return
        }
        toast.success(status === "published" ? "Template published" : "Saved as a draft")
        onSaved()
        onClose()
      } catch {
        setError("Could not reach the server.")
      } finally {
        setSaving(false)
      }
    },
    [templateId, title, description, category, bodyHtml, fields, parityErrors.length, onSaved, onClose]
  )

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-6xl max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review before publishing</DialogTitle>
          <DialogDescription>
            This is a machine reconstruction of a court form. Read it against the original on the left
            before it goes out to advocates.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">The court&apos;s original</p>
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Open full size <ExternalLink size={11} />
                </a>
              )}
            </div>
            <div className="h-[600px] rounded-lg border-2 border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-900">
              {pdfLoading ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : pdfError ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 px-6 text-center">
                  <FileWarning className="w-7 h-7 text-gray-300 dark:text-gray-600" />
                  <p className="text-xs text-gray-500 dark:text-gray-400">{pdfError}</p>
                </div>
              ) : (
                <iframe src={pdfUrl} title="The court's original form" className="w-full h-full" />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={160}
                  className="mt-1 w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={400}
                className="mt-1 w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Body</label>
              <div className="mt-1">
                <TemplateBodyEditor initialContent={bodyHtml} onChange={(html) => setBodyHtml(html)} />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Fields</label>
              <div className="mt-1">
                <TemplateFieldsEditor
                  fields={fields}
                  onChange={setFields}
                  parityErrors={parityErrors.length > 0 ? parityErrors : initialParityErrors ?? []}
                  disabled={saving}
                />
              </div>
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Close
          </Button>
          <Button variant="outline" onClick={() => save("draft")} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save as draft"}
          </Button>
          <Button
            onClick={() => save("published")}
            disabled={saving || !canPublish}
            title={
              canPublish
                ? undefined
                : "The body and the field list have to agree before this can be published."
            }
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
