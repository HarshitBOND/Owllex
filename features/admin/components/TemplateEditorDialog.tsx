"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"
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
import type { DocumentTemplateRecord } from "../types"
import type { TemplateInput } from "../hooks/useDocumentTemplatesData"

const TemplateBodyEditor = dynamic(() => import("./TemplateBodyEditor"), {
  ssr: false,
  loading: () => (
    <div className="h-[320px] flex items-center justify-center rounded-lg border-2 border-gray-200 dark:border-gray-700">
      <div className="w-6 h-6 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
    </div>
  ),
})

const MIN_BODY_CHARS = 40

export function TemplateEditorDialog({
  open,
  editing,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean
  editing: DocumentTemplateRecord | null
  saving: boolean
  onClose: () => void
  onSubmit: (input: TemplateInput) => Promise<boolean>
}) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<string>(DOCUMENT_CATEGORIES[0])
  const [bodyHtml, setBodyHtml] = useState("")
  const [bodyLength, setBodyLength] = useState(0)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    setTitle(editing?.title || "")
    setDescription(editing?.description || "")
    setCategory(editing?.category || DOCUMENT_CATEGORIES[0])
    setBodyHtml(editing?.bodyHtml || "")
    setBodyLength((editing?.bodyHtml || "").replace(/<[^>]*>/g, "").trim().length)
    setError("")
  }, [open, editing])

  const submit = async (status: "draft" | "published") => {
    if (title.trim().length < 2) {
      setError("Give the template a title of at least 2 characters.")
      return
    }
    if (status === "published" && bodyLength < MIN_BODY_CHARS) {
      setError(`A published template needs a body of at least ${MIN_BODY_CHARS} characters.`)
      return
    }
    if (!bodyHtml.trim()) {
      setError("The template body cannot be empty.")
      return
    }
    setError("")
    const ok = await onSubmit({ title: title.trim(), description: description.trim(), category, bodyHtml, status })
    if (ok) onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>
            Published templates appear in the Draft Documents library for every user.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Residential Rental Agreement"
                maxLength={160}
                className="mt-1 w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800"
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
              placeholder="Short summary shown on the template card"
              maxLength={400}
              className="mt-1 w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Template body</label>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                {bodyLength} characters
                {bodyLength < MIN_BODY_CHARS && ` · ${MIN_BODY_CHARS} needed to publish`}
              </span>
            </div>
            <div className="mt-1">
              {open && (
                <TemplateBodyEditor
                  key={editing?._id || "new"}
                  initialContent={editing?.bodyHtml || ""}
                  onChange={(html, length) => {
                    setBodyHtml(html)
                    setBodyLength(length)
                  }}
                />
              )}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => submit("draft")} disabled={saving} className="gap-1.5">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save as draft
          </Button>
          <Button onClick={() => submit("published")} disabled={saving} className="gap-1.5">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save &amp; publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
