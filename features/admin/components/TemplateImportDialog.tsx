"use client"

import { useRef, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  CopyCheck,
  FileText,
  Loader2,
  RefreshCw,
  ScanSearch,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useTemplateImport, type TemplateImportItem } from "../hooks/useTemplateImport"
import { TemplateReviewDialog } from "./TemplateReviewDialog"
import { DuplicateReviewPanel } from "./DuplicateReviewPanel"

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StatusIcon({ item }: { item: TemplateImportItem }) {
  switch (item.status) {
    case "ready":
      return <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-500" />
    case "failed":
      return <XCircle size={16} className="text-red-600 dark:text-red-500" />
    case "duplicate":
      return <CopyCheck size={16} className="text-amber-600 dark:text-amber-500" />
    case "uploading":
    case "extracting":
      return <Loader2 size={16} className="animate-spin text-blue-600 dark:text-blue-400" />
    default:
      return <FileText size={16} className="text-gray-400" />
  }
}

function statusLabel(item: TemplateImportItem) {
  switch (item.status) {
    case "pending":
      return "Waiting"
    case "uploading":
      return `Uploading ${item.progress}%`
    // OCR and the extraction model, neither of which reports progress -- so it
    // says what is happening rather than showing a bar that isn't moving.
    case "extracting":
      return "Reading the form"
    case "ready":
      return `${item.template?.fields.length ?? 0} fields found`
    case "duplicate":
      return "Already imported"
    case "failed":
      return "Failed"
  }
}

export function TemplateImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [reviewing, setReviewing] = useState<TemplateImportItem | null>(null)
  const [checkingDupes, setCheckingDupes] = useState<TemplateImportItem | null>(null)

  const { items, running, addFiles, removeItem, clearFinished, uploadAll, retryItem, pendingCount, readyCount, failedCount } =
    useTemplateImport(onImported)

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && !running && onClose()}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import court forms</DialogTitle>
            <DialogDescription>
              Drop in the PDFs a court issues. Each one is stored, read, and turned into a draft template
              you review before publishing.
            </DialogDescription>
          </DialogHeader>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              addFiles(Array.from(e.dataTransfer.files))
            }}
            className={cn(
              "rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
              dragging
                ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/30"
                : "border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40"
            )}
          >
            <UploadCloud className="w-8 h-8 mx-auto text-gray-400" />
            <p className="mt-2 text-sm font-medium text-gray-800 dark:text-gray-100">
              Drop court form PDFs here
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              As many at once as you like &mdash; they upload two at a time, and one failure won&apos;t
              stop the rest. 25MB per file.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => inputRef.current?.click()}
              disabled={running}
            >
              Choose files
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(Array.from(e.target.files || []))
                e.target.value = ""
              }}
            />
          </div>

          {items.length > 0 && (
            <div className="rounded-lg border-2 border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 max-h-[320px] overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <StatusIcon item={item} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{item.file.name}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        {formatSize(item.file.size)} &middot; {statusLabel(item)}
                      </p>
                    </div>

                    {item.status === "ready" && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setCheckingDupes(item)}
                          title="Check whether this form is already in the library"
                        >
                          <ScanSearch size={13} className="mr-1" />
                          Duplicates
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setReviewing(item)}>
                          Review
                        </Button>
                      </>
                    )}

                    {item.status === "duplicate" && (
                      <Button size="sm" variant="outline" onClick={() => retryItem(item.id, true)}>
                        Import anyway
                      </Button>
                    )}

                    {item.status === "failed" && (
                      <Button size="sm" variant="outline" onClick={() => retryItem(item.id)}>
                        <RefreshCw size={13} className="mr-1" />
                        Retry
                      </Button>
                    )}

                    {(item.status === "pending" || item.status === "failed" || item.status === "duplicate") && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove ${item.file.name}`}
                        className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>

                  {item.status === "uploading" && (
                    <div className="mt-2 h-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-[width] duration-200"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}

                  {item.error && item.status !== "ready" && (
                    <p className="mt-1.5 pl-[26px] text-[11px] text-red-600 dark:text-red-400">{item.error}</p>
                  )}

                  {item.status === "ready" && (item.parityErrors?.length ?? 0) > 0 && (
                    <p className="mt-1.5 pl-[26px] text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-1">
                      <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                      Some tokens and fields don&apos;t line up &mdash; fix them in Review before publishing.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {readyCount > 0 && `${readyCount} imported as drafts. `}
              {failedCount > 0 && `${failedCount} failed. `}
              {readyCount > 0 && "Nothing is visible to advocates until you publish it."}
            </p>
          )}

          <DialogFooter className="gap-2">
            {(readyCount > 0 || failedCount > 0) && (
              <Button variant="ghost" onClick={clearFinished} disabled={running}>
                Clear finished
              </Button>
            )}
            <Button variant="outline" onClick={onClose} disabled={running}>
              Close
            </Button>
            <Button onClick={uploadAll} disabled={running || pendingCount === 0}>
              {running ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Importing
                </>
              ) : (
                `Import ${pendingCount || ""}`.trim()
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemplateReviewDialog
        open={!!reviewing}
        templateId={reviewing?.template?.id ?? null}
        initial={
          reviewing?.template
            ? {
                title: reviewing.template.title,
                description: reviewing.template.description,
                category: reviewing.template.category,
                bodyHtml: reviewing.template.bodyHtml,
                fields: reviewing.template.fields,
              }
            : null
        }
        initialParityErrors={reviewing?.parityErrors}
        onClose={() => setReviewing(null)}
        onSaved={onImported}
      />

      <DuplicateReviewPanel
        open={!!checkingDupes}
        templateId={checkingDupes?.template?.id ?? null}
        templateTitle={checkingDupes?.template?.title ?? ""}
        onClose={() => setCheckingDupes(null)}
        onResolved={() => {
          // Discarding or superseding removes the imported draft, so the row
          // must go with it or "Review" would open a template that is gone.
          if (checkingDupes) removeItem(checkingDupes.id)
          onImported()
        }}
      />
    </>
  )
}
