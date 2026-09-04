"use client"

import { useState } from "react"
import { Archive, Eye, EyeOff, FileStack, Loader2, Pencil, Plus, ScanSearch, Search, Stamp, Trash2, UploadCloud } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { DOCUMENT_CATEGORIES } from "@/lib/document-categories"
import type { DocumentTemplateRecord } from "../types"
import type { useDocumentTemplatesData } from "../hooks/useDocumentTemplatesData"
import { formatDateTime } from "../utils"
import { Pagination } from "./Pagination"
import { TemplateEditorDialog } from "./TemplateEditorDialog"
import { TemplateImportDialog } from "./TemplateImportDialog"
import { DuplicateReviewPanel } from "./DuplicateReviewPanel"
import { TemplateOverlayMapper } from "./TemplateOverlayMapper"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function DocumentTemplatesTab({ data }: { data: ReturnType<typeof useDocumentTemplatesData> }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<DocumentTemplateRecord | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<DocumentTemplateRecord | null>(null)
  const [checkingDupes, setCheckingDupes] = useState<DocumentTemplateRecord | null>(null)
  const [mapping, setMapping] = useState<DocumentTemplateRecord | null>(null)

  const openMapper = async (row: DocumentTemplateRecord) => {
    // The list omits bodyHtml and may omit fields, and the mapper needs the
    // full field list to place.
    const full = await data.loadTemplate(row._id)
    if (!full) return
    setMapping(full)
  }

  const openNew = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = async (row: DocumentTemplateRecord) => {
    const full = await data.loadTemplate(row._id)
    if (!full) return
    setEditing(full)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={data.tplSearch}
              onChange={(e) => data.setTplSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && data.fetchTemplates()}
              placeholder="Search templates..."
              className="w-full pl-9 pr-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
          </div>
          <select
            value={data.tplCategoryFilter}
            onChange={(e) => {
              data.setTplCategoryFilter(e.target.value)
              setTimeout(() => data.fetchTemplates(), 0)
            }}
            className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800"
          >
            <option value="">All categories</option>
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={data.tplStatusFilter}
            onChange={(e) => {
              data.setTplStatusFilter(e.target.value)
              setTimeout(() => data.fetchTemplates(), 0)
            }}
            className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800"
          >
            <option value="">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
          <Button size="sm" variant="outline" onClick={() => data.fetchTemplates()} className="gap-1.5">
            <Search size={14} /> Search
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5">
            <UploadCloud size={14} /> Import from PDF
          </Button>
          <Button size="sm" onClick={openNew} className="gap-1.5">
            <Plus size={14} /> New template
          </Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{data.tplTotal} total templates</p>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Used</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Updated</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.templates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <FileStack size={28} className="mx-auto text-gray-300 dark:text-gray-600" />
                    <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">No templates yet</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Create one to make it available in the Draft Documents library.
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5">
                        <UploadCloud size={14} /> Import from PDF
                      </Button>
                      <Button size="sm" onClick={openNew} className="gap-1.5">
                        <Plus size={14} /> New template
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                data.templates.map((t) => (
                  <tr key={t._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 max-w-[260px]">
                      <p className="font-medium text-gray-900 dark:text-white truncate">{t.title}</p>
                      {t.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{t.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        {t.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {t.status === "published" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 border border-brand-200 text-brand-700 dark:bg-brand-500/10 dark:border-brand-500/20 dark:text-brand-400">
                          Published
                        </span>
                      ) : t.status === "archived" ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 border border-gray-200 text-gray-600 dark:bg-gray-500/10 dark:border-gray-500/20 dark:text-gray-400"
                          title="Hidden from the library. Documents already drafted from it still open."
                        >
                          <Archive size={10} /> Archived
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 border border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400">
                          Draft
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{t.usageCount}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">
                      {formatDateTime(t.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          disabled={data.savingId === t._id}
                          onClick={() => openEdit(t)}
                        >
                          <Pencil size={12} /> Edit
                        </Button>
                        {t.status === "draft" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            disabled={data.savingId === t._id}
                            onClick={() => setCheckingDupes(t)}
                            title="Check whether this form is already published"
                          >
                            <ScanSearch size={12} /> Duplicates
                          </Button>
                        )}
                        {(t.fields?.length ?? 0) > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            disabled={data.savingId === t._id}
                            onClick={() => openMapper(t)}
                            title="Place each field on the court's own PDF so values can be stamped onto it"
                          >
                            <Stamp size={12} /> Place on PDF
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          disabled={data.savingId === t._id}
                          onClick={() => data.togglePublish(t._id, t.status === "published" ? "draft" : "published")}
                          hidden={t.status === "archived"}
                        >
                          {data.savingId === t._id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : t.status === "published" ? (
                            <EyeOff size={12} />
                          ) : (
                            <Eye size={12} />
                          )}
                          {t.status === "published" ? "Unpublish" : "Publish"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 text-red-600 hover:text-red-700"
                          disabled={data.savingId === t._id}
                          onClick={() => setConfirmDelete(t)}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={data.tplPage}
          totalPages={data.tplTotalPages}
          total={data.tplTotal}
          label="templates"
          onPrev={() => data.fetchTemplates(data.tplPage - 1)}
          onNext={() => data.fetchTemplates(data.tplPage + 1)}
        />
      </div>

      <TemplateEditorDialog
        open={dialogOpen}
        editing={editing}
        saving={data.savingId !== null}
        onClose={() => setDialogOpen(false)}
        onSubmit={(input) =>
          editing ? data.updateTemplate(editing._id, input) : data.createTemplate(input)
        }
      />

      <Dialog open={mapping !== null} onOpenChange={(v) => !v && setMapping(null)}>
        <DialogContent className="max-w-6xl max-h-[94vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Place fields on the court&apos;s PDF</DialogTitle>
            <DialogDescription>
              Values are drawn onto the court&apos;s own form rather than onto a rebuild of it, so the
              printed result is exact. Drag a box where each value should appear.
            </DialogDescription>
          </DialogHeader>
          {mapping && (
            <TemplateOverlayMapper
              templateId={mapping._id}
              version={mapping.latestVersion}
              fields={mapping.fields ?? []}
              onSaved={() => {
                setMapping(null)
                data.fetchTemplates(data.tplPage)
              }}
              onClose={() => setMapping(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <DuplicateReviewPanel
        open={checkingDupes !== null}
        templateId={checkingDupes?._id ?? null}
        templateTitle={checkingDupes?.title ?? ""}
        onClose={() => setCheckingDupes(null)}
        onResolved={() => data.fetchTemplates(data.tplPage)}
      />

      <TemplateImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => data.fetchTemplates(1)}
      />

      <AlertDialog open={confirmDelete !== null} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this template?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{confirmDelete?.title}&rdquo; will stop appearing in the library. If any document has
              already been drafted from it, it is archived rather than deleted, so those documents keep
              working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (confirmDelete) data.deleteTemplate(confirmDelete._id)
                setConfirmDelete(null)
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
