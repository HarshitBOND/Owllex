import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import type { TemplateField } from "@/lib/templates/fields"

/**
 * Drives the batch import of court PDFs as a client-side queue.
 *
 * The server takes one file per request because OCR on a scanned form can run
 * for minutes and a request carrying ten of them cannot finish inside any
 * serverless limit. Queuing here gives the admin the thing they actually want
 * from a batch -- drop everything at once, walk away -- while keeping each
 * file's success, failure and retry independent of the rest.
 */

export type TemplateImportStatus =
  | "pending"
  | "uploading"
  | "extracting"
  | "ready"
  | "failed"
  | "duplicate"

export type ImportedTemplate = {
  id: string
  title: string
  description: string
  category: string
  status: string
  bodyHtml: string
  fields: TemplateField[]
  sourcePdf: { r2Key: string; filename: string; sizeBytes: number; sha256: string; pageCount: number }
}

export type TemplateImportItem = {
  id: string
  file: File
  status: TemplateImportStatus
  /** Upload progress only. Extraction has no progress to report, so it spins instead of lying. */
  progress: number
  error?: string
  duplicateOf?: { id: string; title: string; status: string } | null
  template?: ImportedTemplate
  parityErrors?: string[]
}

/**
 * Two at a time. Each request can hold a serverless function for minutes, and
 * the extraction model is the real bottleneck -- more parallelism buys nothing
 * and makes a rate limit more likely.
 */
const MAX_CONCURRENT = 2

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function useTemplateImport(onImported?: () => void) {
  const [items, setItems] = useState<TemplateImportItem[]>([])
  const [running, setRunning] = useState(false)
  const itemsRef = useRef<TemplateImportItem[]>([])
  itemsRef.current = items

  const patch = useCallback((id: string, changes: Partial<TemplateImportItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)))
  }, [])

  const addFiles = useCallback((files: File[]) => {
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"))
    const rejected = files.length - pdfs.length
    if (rejected > 0) {
      toast.error(
        rejected === 1
          ? "Only PDFs can be imported as court forms. One file was skipped."
          : `Only PDFs can be imported as court forms. ${rejected} files were skipped.`
      )
    }
    if (pdfs.length === 0) return

    setItems((prev) => [
      ...prev,
      ...pdfs.map((file) => ({ id: newId(), file, status: "pending" as const, progress: 0 })),
    ])
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const clearFinished = useCallback(() => {
    setItems((prev) => prev.filter((item) => item.status !== "ready" && item.status !== "duplicate"))
  }, [])

  /**
   * XHR rather than fetch, purely for upload progress. A scanned form can be
   * 20MB on a slow connection, and a spinner that says nothing for ninety
   * seconds reads as a hang.
   */
  const uploadOne = useCallback(
    (item: TemplateImportItem, force: boolean) =>
      new Promise<void>((resolve) => {
        const body = new FormData()
        body.append("file", item.file)
        if (force) body.append("force", "true")

        const xhr = new XMLHttpRequest()
        xhr.open("POST", "/api/admin/document-templates/import-pdf")

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return
          patch(item.id, { status: "uploading", progress: Math.round((event.loaded / event.total) * 100) })
        }

        // The bytes are in; everything after this is OCR and the extraction
        // model, neither of which reports progress.
        xhr.upload.onload = () => patch(item.id, { status: "extracting", progress: 100 })

        xhr.onload = () => {
          let data: Record<string, unknown> = {}
          try {
            data = JSON.parse(xhr.responseText)
          } catch {
            patch(item.id, { status: "failed", error: "The server sent back something unreadable." })
            resolve()
            return
          }

          if (xhr.status === 409 && data.duplicateOf) {
            patch(item.id, {
              status: "duplicate",
              duplicateOf: data.duplicateOf as TemplateImportItem["duplicateOf"],
              error: String(data.error || ""),
            })
            resolve()
            return
          }

          if (!data.success) {
            patch(item.id, { status: "failed", error: String(data.error || `Import failed (HTTP ${xhr.status})`) })
            resolve()
            return
          }

          patch(item.id, {
            status: "ready",
            template: data.template as ImportedTemplate,
            parityErrors: (data.parityErrors as string[]) || [],
            error: undefined,
          })
          resolve()
        }

        xhr.onerror = () => {
          patch(item.id, {
            status: "failed",
            error: "Could not reach the server. Check your connection and retry this file.",
          })
          resolve()
        }

        xhr.ontimeout = () => {
          patch(item.id, { status: "failed", error: "The import timed out." })
          resolve()
        }

        xhr.send(body)
      }),
    [patch]
  )

  /** Runs the queue with a bounded number in flight; one failure never stops the rest. */
  const drain = useCallback(
    async (forceIds: Set<string>) => {
      setRunning(true)
      const queue = itemsRef.current.filter((i) => i.status === "pending").map((i) => i.id)
      let cursor = 0
      let imported = 0

      const worker = async () => {
        while (cursor < queue.length) {
          const id = queue[cursor++]
          const item = itemsRef.current.find((i) => i.id === id)
          if (!item) continue
          await uploadOne(item, forceIds.has(id))
          if (itemsRef.current.find((i) => i.id === id)?.status === "ready") imported++
        }
      }

      await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, worker))
      setRunning(false)

      if (imported > 0) {
        toast.success(
          imported === 1 ? "1 form imported as a draft" : `${imported} forms imported as drafts`,
          { description: "Review each one against its original before publishing." }
        )
        onImported?.()
      }
    },
    [uploadOne, onImported]
  )

  const uploadAll = useCallback(() => drain(new Set()), [drain])

  const retryItem = useCallback(
    async (id: string, force = false) => {
      patch(id, { status: "pending", progress: 0, error: undefined })
      const item = itemsRef.current.find((i) => i.id === id)
      if (!item) return
      setRunning(true)
      await uploadOne({ ...item, status: "pending", progress: 0 }, force)
      setRunning(false)
      if (itemsRef.current.find((i) => i.id === id)?.status === "ready") onImported?.()
    },
    [patch, uploadOne, onImported]
  )

  return {
    items,
    running,
    addFiles,
    removeItem,
    clearFinished,
    uploadAll,
    retryItem,
    pendingCount: items.filter((i) => i.status === "pending").length,
    readyCount: items.filter((i) => i.status === "ready").length,
    failedCount: items.filter((i) => i.status === "failed").length,
  }
}
