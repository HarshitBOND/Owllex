"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowRight, FilePlus2, FileStack, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { styleFor } from "../category-styles"

type Draft = {
  id: string
  title: string
  status: string
  category: string | null
  templateTitle: string
  wordCount: number
  updatedAt: string
}

type Template = { id: string; title: string; description: string; category: string }

function relativeTime(iso: string) {
  const then = new Date(iso).getTime()
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

export default function DraftDocumentsHome() {
  const router = useRouter()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Draft | null>(null)

  const loadDrafts = useCallback(async (limit: number) => {
    try {
      const res = await fetch(`/api/draft-documents?limit=${limit}`)
      const data = await res.json()
      if (data.success) setDrafts(data.drafts)
    } catch (err) {
      console.error("Recent documents fetch error:", err)
    }
  }, [])

  useEffect(() => {
    Promise.all([
      loadDrafts(showAll ? 50 : 6),
      fetch("/api/document-templates?sort=popular&limit=3")
        .then((r) => r.json())
        .then((d) => d.success && setTemplates(d.templates))
        .catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [loadDrafts, showAll])

  const rename = async (draft: Draft) => {
    const next = window.prompt("Rename document", draft.title)
    if (next === null) return
    const title = next.trim()
    if (!title || title === draft.title) return

    const current = await fetch(`/api/draft-documents/${draft.id}`).then((r) => r.json())
    if (!current.success) return

    const res = await fetch(`/api/draft-documents/${draft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, version: current.draft.version }),
    })
    const data = await res.json()
    if (data.success) {
      toast.success("Document renamed")
      loadDrafts(showAll ? 50 : 6)
    } else {
      toast.error(data.error || "Could not rename the document")
    }
  }

  const remove = async (draft: Draft) => {
    setDrafts((prev) => prev.filter((d) => d.id !== draft.id))

    try {
      const res = await fetch(`/api/draft-documents/${draft.id}`, { method: "DELETE" })
      const data = await res.json()
      if (data.success || res.status === 404) {
        toast.success("Document deleted")
      } else {
        setDrafts((prev) => (prev.some((d) => d.id === draft.id) ? prev : [...prev, draft]))
        toast.error(data.error || "Could not delete the document")
      }
    } catch (err) {
      console.error("Delete document error:", err)
      setDrafts((prev) => (prev.some((d) => d.id === draft.id) ? prev : [...prev, draft]))
      toast.error("Could not delete the document")
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-foreground mb-3">Start a new document</h2>
        <div className="flex flex-col lg:flex-row gap-4">
          <button
            type="button"
            onClick={() => router.push("/draft-documents/new")}
            className="lg:w-64 shrink-0 flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 dark:border-border bg-accent/5 hover:bg-accent/10 transition-colors py-10 px-6"
          >
            <span className="w-11 h-11 rounded-full bg-accent flex items-center justify-center text-white">
              <Plus className="w-5 h-5" />
            </span>
            <span className="text-center">
              <span className="block text-sm font-semibold text-gray-900 dark:text-foreground">Blank document</span>
              <span className="block text-xs text-gray-500 dark:text-muted-foreground mt-0.5">Start from scratch</span>
            </span>
          </button>

          <div className="hidden lg:flex flex-col items-center justify-center px-1">
            <span className="text-xs text-gray-400">or</span>
          </div>

          <div className="flex-1 flex flex-col gap-2 min-w-0">
            <p className="text-xs font-medium text-gray-500 dark:text-muted-foreground">Use a template</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {templates.map((template) => {
                const style = styleFor(template.category)
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => router.push(`/draft-documents/new?templateId=${template.id}`)}
                    className="group text-left rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card hover:border-accent/40 hover:shadow-sm transition-all p-4 flex flex-col min-h-[128px]"
                  >
                    <span className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-4", style.bgColor)}>
                      <style.icon className={cn("w-4 h-4", style.color)} />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-semibold text-gray-900 dark:text-foreground">
                        {template.title}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-muted-foreground mt-0.5 line-clamp-2">
                        {template.description}
                      </span>
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-accent self-end mt-2 transition-colors" />
                  </button>
                )
              })}

              <button
                type="button"
                onClick={() => router.push("/draft-documents/templates")}
                className="group text-left rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card hover:border-accent/40 hover:shadow-sm transition-all p-4 flex flex-col min-h-[128px]"
              >
                <span className="w-9 h-9 rounded-lg flex items-center justify-center mb-4 bg-gray-100 dark:bg-secondary">
                  <FileStack className="w-4 h-4 text-gray-600 dark:text-muted-foreground" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-gray-900 dark:text-foreground">
                    Browse templates
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-muted-foreground mt-0.5">
                    See everything available
                  </span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-accent self-end mt-2 transition-colors" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-foreground">Recent documents</h2>
          {drafts.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-xs font-medium text-accent hover:underline"
            >
              {showAll ? "Show recent" : "View all"}
            </button>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden">
          {loading ? (
            <div className="divide-y divide-gray-100 dark:divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-secondary shrink-0" />
                  <div className="flex-1">
                    <div className="h-3.5 w-48 bg-gray-100 dark:bg-secondary rounded" />
                    <div className="h-3 w-24 bg-gray-100 dark:bg-secondary rounded mt-1.5" />
                  </div>
                </div>
              ))}
            </div>
          ) : drafts.length === 0 ? (
            <div className="py-14 flex flex-col items-center justify-center text-center gap-2 px-6">
              <FilePlus2 className="w-8 h-8 text-gray-300 dark:text-gray-600" />
              <p className="text-sm font-semibold text-gray-900 dark:text-foreground">No documents yet</p>
              <p className="text-xs text-gray-500 dark:text-muted-foreground">
                Start a blank document, or pick a template to get going.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push("/draft-documents/new")}
                  className="text-xs font-medium text-white bg-accent rounded-lg px-3 py-2 hover:opacity-90 transition-opacity"
                >
                  Blank document
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/draft-documents/templates")}
                  className="text-xs font-medium border border-gray-200 dark:border-border rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-secondary transition-colors"
                >
                  Browse templates
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="hidden sm:grid grid-cols-[1fr_140px_170px_28px] gap-4 px-5 py-2.5 border-b border-gray-100 dark:border-border text-xs font-medium text-gray-400">
                <span>Name</span>
                <span>Last modified</span>
                <span>Type</span>
                <span />
              </div>
              {drafts.map((draft, i) => {
                const style = styleFor(draft.category)
                return (
                  <div
                    key={draft.id}
                    className={cn(
                      "grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_140px_170px_28px] gap-2 sm:gap-4 items-center px-5 py-3 hover:bg-gray-50 dark:hover:bg-secondary/50 transition-colors",
                      i !== drafts.length - 1 && "border-b border-gray-100 dark:border-border"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => router.push(`/draft-documents/${draft.id}`)}
                      className="flex items-center gap-3 min-w-0 text-left"
                    >
                      <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", style.bgColor)}>
                        <style.icon className={cn("w-4 h-4", style.color)} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900 dark:text-foreground truncate">
                          {draft.title}
                        </span>
                        <span className="block text-xs text-gray-400">
                          {draft.wordCount.toLocaleString()} words
                        </span>
                      </span>
                    </button>
                    <span className="hidden sm:block text-xs text-gray-500 dark:text-muted-foreground">
                      {relativeTime(draft.updatedAt)}
                    </span>
                    <span className="hidden sm:block">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full text-[11px] font-medium px-2 py-0.5 truncate max-w-full",
                          style.bgColor,
                          style.color
                        )}
                      >
                        {draft.templateTitle || "Blank"}
                      </span>
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="Document actions"
                          className="justify-self-end w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => rename(draft)}>
                          <Pencil className="w-3.5 h-3.5" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setConfirmDelete(draft)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </section>

      <AlertDialog open={confirmDelete !== null} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{confirmDelete?.title}&rdquo; will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (confirmDelete) remove(confirmDelete)
                setConfirmDelete(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
