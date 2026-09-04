"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, ChevronLeft, ChevronRight, Eye, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { canvasBoxToPdf, pdfBoxToCanvas, type PdfBox } from "@/lib/templates/overlay-coords"
import type { TemplateField } from "@/lib/templates/fields"

/**
 * Places each field on the court's own PDF, so values can be stamped onto it
 * rather than onto a rebuild of it.
 *
 * Boxes are drawn on a canvas, which has its origin top-left, and stored in PDF
 * user space, which has its origin bottom-left. That flip happens once, in
 * canvasBoxToPdf, and never again -- getting it wrong twice is what puts every
 * value a page-height from where it belongs.
 */

type Placement = {
  id: string
  page: number
  /** Always PDF user space. Converted for display, never stored as canvas pixels. */
  box: PdfBox
  fieldKey: string
  columnKey?: string
  align: "left" | "center" | "right"
  fontSize: number
}

type TableSettings = Record<string, { rowHeight: number; maxRows: number }>

const MIN_BOX_PX = 8

function newId() {
  return Math.random().toString(36).slice(2, 10)
}

/** A stable colour per field, so a table's columns read as one group. */
function hueFor(key: string) {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) % 360
  return hash
}

export function TemplateOverlayMapper({
  templateId,
  version,
  fields,
  onSaved,
  onClose,
}: {
  templateId: string
  version?: number
  fields: TemplateField[]
  onSaved: (fields: TemplateField[]) => void
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const pdfRef = useRef<{ numPages: number; getPage: (n: number) => Promise<unknown> } | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [pageIndex, setPageIndex] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const [scale, setScale] = useState(1)
  const [pageHeightPt, setPageHeightPt] = useState(842)

  const [placements, setPlacements] = useState<Placement[]>([])
  const [tableSettings, setTableSettings] = useState<TableSettings>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [drawing, setDrawing] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  // Existing coordinates are unpacked back into individual boxes so a saved
  // mapping can be adjusted rather than redrawn from nothing.
  useEffect(() => {
    const restored: Placement[] = []
    const tables: TableSettings = {}

    for (const field of fields) {
      const overlay = field.overlay
      if (!overlay) continue

      if (field.type === "table") {
        tables[field.key] = {
          rowHeight: overlay.rowHeight ?? overlay.height,
          maxRows: overlay.maxRows ?? 3,
        }
        for (const column of field.columns) {
          const cell = overlay.columns?.[column.key]
          if (!cell) continue
          restored.push({
            id: newId(),
            page: overlay.page,
            box: { x: cell.x, y: overlay.y, width: cell.width, height: overlay.rowHeight ?? overlay.height },
            fieldKey: field.key,
            columnKey: column.key,
            align: cell.align ?? "left",
            fontSize: overlay.fontSize,
          })
        }
        continue
      }

      restored.push({
        id: newId(),
        page: overlay.page,
        box: { x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height },
        fieldKey: field.key,
        align: overlay.align,
        fontSize: overlay.fontSize,
      })
    }

    setPlacements(restored)
    setTableSettings(tables)
  }, [fields])

  const renderPage = useCallback(async (index: number) => {
    const doc = pdfRef.current
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!doc || !canvas || !wrap) return

    const page = (await doc.getPage(index + 1)) as {
      getViewport: (o: { scale: number }) => { width: number; height: number }
      render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> }
    }

    const unscaled = page.getViewport({ scale: 1 })
    const fit = Math.min((wrap.clientWidth - 2) / unscaled.width, 1.8)
    const viewport = page.getViewport({ scale: fit })

    canvas.width = viewport.width
    canvas.height = viewport.height

    const ctx = canvas.getContext("2d")
    if (!ctx) return
    await page.render({ canvasContext: ctx, viewport }).promise

    setScale(fit)
    setPageHeightPt(unscaled.height)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch(
          `/api/admin/document-templates/${templateId}/source${version ? `?version=${version}` : ""}`
        )
        const data = await res.json()
        if (!data.success) throw new Error(data.error || "The original PDF could not be opened.")

        const pdfjs = await import("pdfjs-dist")
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString()

        const doc = await pdfjs.getDocument({ url: data.url }).promise
        if (cancelled) return

        pdfRef.current = doc as unknown as { numPages: number; getPage: (n: number) => Promise<unknown> }
        setPageCount(doc.numPages)
        await renderPage(0)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "The PDF could not be loaded.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [templateId, version, renderPage])

  useEffect(() => {
    if (!loading && !error) void renderPage(pageIndex)
  }, [pageIndex, loading, error, renderPage])

  const onPage = placements.filter((p) => p.page === pageIndex)
  const current = placements.find((p) => p.id === selected) ?? null

  const unmapped = useMemo(() => {
    return fields.filter((field) => {
      if (field.type === "table") {
        const placed = placements.filter((p) => p.fieldKey === field.key && p.columnKey)
        return placed.length < field.columns.length
      }
      return !placements.some((p) => p.fieldKey === field.key)
    })
  }, [fields, placements])

  const startDraw = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setDrawing({ x: e.clientX - rect.left, y: e.clientY - rect.top, w: 0, h: 0 })
  }

  const moveDraw = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawing) return
    const rect = e.currentTarget.getBoundingClientRect()
    setDrawing({ ...drawing, w: e.clientX - rect.left - drawing.x, h: e.clientY - rect.top - drawing.y })
  }

  const endDraw = () => {
    if (!drawing) return
    const box = {
      x: drawing.w < 0 ? drawing.x + drawing.w : drawing.x,
      y: drawing.h < 0 ? drawing.y + drawing.h : drawing.y,
      width: Math.abs(drawing.w),
      height: Math.abs(drawing.h),
    }
    setDrawing(null)
    // A click, not a drag: too small to be a field, and treating it as one
    // would litter the page with slivers.
    if (box.width < MIN_BOX_PX || box.height < MIN_BOX_PX) return

    const placement: Placement = {
      id: newId(),
      page: pageIndex,
      box: canvasBoxToPdf(box, scale, pageHeightPt),
      fieldKey: "",
      align: "left",
      fontSize: 10,
    }
    setPlacements((prev) => [...prev, placement])
    setSelected(placement.id)
  }

  const update = (id: string, changes: Partial<Placement>) => {
    setPlacements((prev) => prev.map((p) => (p.id === id ? { ...p, ...changes } : p)))
  }

  /** Folds the drawn boxes back into each field's overlay. */
  const buildFields = useCallback((): TemplateField[] => {
    return fields.map((field) => {
      if (field.type === "table") {
        const cells = placements.filter((p) => p.fieldKey === field.key && p.columnKey)
        if (cells.length === 0) return { ...field, overlay: null }

        const settings = tableSettings[field.key] ?? { rowHeight: cells[0].box.height, maxRows: 3 }
        const left = Math.min(...cells.map((c) => c.box.x))
        const right = Math.max(...cells.map((c) => c.box.x + c.box.width))
        // Every cell of the first row shares one baseline; the lowest wins so
        // nothing is clipped when a column was drawn slightly taller.
        const rowY = Math.min(...cells.map((c) => c.box.y))

        return {
          ...field,
          overlay: {
            page: cells[0].page,
            x: left,
            y: rowY,
            width: right - left,
            height: settings.rowHeight * settings.maxRows,
            fontSize: cells[0].fontSize,
            align: "left" as const,
            rowHeight: settings.rowHeight,
            maxRows: settings.maxRows,
            columns: Object.fromEntries(
              cells.map((c) => [c.columnKey as string, { x: c.box.x, width: c.box.width, align: c.align }])
            ),
          },
        }
      }

      const placement = placements.find((p) => p.fieldKey === field.key && !p.columnKey)
      if (!placement) return { ...field, overlay: null }

      return {
        ...field,
        overlay: {
          page: placement.page,
          x: placement.box.x,
          y: placement.box.y,
          width: placement.box.width,
          height: placement.box.height,
          fontSize: placement.fontSize,
          align: placement.align,
        },
      }
    })
  }, [fields, placements, tableSettings])

  const save = async (renderMode: "html" | "pdf-overlay") => {
    if (renderMode === "pdf-overlay" && unmapped.length > 0) {
      toast.error("Every field needs a position before stamping can be switched on", {
        description: unmapped.map((f) => f.label).join(", "),
      })
      return
    }

    setSaving(true)
    try {
      const next = buildFields()
      const res = await fetch(`/api/admin/document-templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: next, renderMode, changeNote: "Positions on the court's PDF" }),
      })
      const data = await res.json()
      if (!data.success) {
        toast.error(data.error || "Could not save the positions.")
        return
      }
      toast.success(
        renderMode === "pdf-overlay"
          ? "Stamping switched on — exports now use the court's own PDF"
          : "Positions saved"
      )
      onSaved(next)
    } catch {
      toast.error("Could not reach the server.")
    } finally {
      setSaving(false)
    }
  }

  const preview = async () => {
    setPreviewing(true)
    try {
      const res = await fetch(`/api/admin/document-templates/${templateId}/overlay-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: buildFields() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || "The preview could not be produced.")
        return
      }
      const blob = await res.blob()
      window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer")
    } catch {
      toast.error("Could not reach the server.")
    } finally {
      setPreviewing(false)
    }
  }

  if (error) {
    return (
      <div className="rounded-xl border-2 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-6 text-center">
        <AlertTriangle className="w-7 h-7 text-red-500 mx-auto" />
        <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
          Stamping needs the court&apos;s original PDF, so it is only available for imported forms.
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onClose}>
          Close
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pageIndex === 0}
            onClick={() => setPageIndex((i) => i - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </Button>
          <span className="text-xs text-gray-600 dark:text-gray-300 tabular-nums">
            Page {pageIndex + 1} of {pageCount}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={pageIndex >= pageCount - 1}
            onClick={() => setPageIndex((i) => i + 1)}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </Button>
          <p className="ml-auto text-[11px] text-gray-500 dark:text-gray-400">
            Drag a box where a value should print, then say which field it is.
          </p>
        </div>

        <div
          ref={wrapRef}
          className="relative border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-auto bg-gray-100 dark:bg-gray-900 max-h-[70vh]"
        >
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 dark:bg-gray-900/70">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          )}

          <div
            className="relative inline-block cursor-crosshair select-none"
            onMouseDown={startDraw}
            onMouseMove={moveDraw}
            onMouseUp={endDraw}
            onMouseLeave={() => setDrawing(null)}
          >
            <canvas ref={canvasRef} className="block" />

            {onPage.map((placement) => {
              const box = pdfBoxToCanvas(placement.box, scale, pageHeightPt)
              const hue = placement.fieldKey ? hueFor(placement.fieldKey) : 0
              const isSelected = placement.id === selected
              return (
                <button
                  key={placement.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    setSelected(placement.id)
                  }}
                  aria-label={placement.fieldKey || "Unassigned box"}
                  className={cn(
                    "absolute rounded-[2px] text-[9px] leading-none overflow-hidden text-left",
                    isSelected ? "ring-2 ring-offset-1" : "ring-1"
                  )}
                  style={{
                    left: box.x,
                    top: box.y,
                    width: box.width,
                    height: box.height,
                    background: placement.fieldKey
                      ? `hsla(${hue}, 70%, 55%, 0.22)`
                      : "hsla(0, 0%, 50%, 0.25)",
                    // @ts-expect-error -- CSS custom property for the ring colour
                    "--tw-ring-color": placement.fieldKey ? `hsl(${hue}, 70%, 45%)` : "#9ca3af",
                  }}
                >
                  <span className="px-0.5 text-gray-900 dark:text-gray-900 font-medium">
                    {placement.columnKey
                      ? `${placement.fieldKey}.${placement.columnKey}`
                      : placement.fieldKey || "unassigned"}
                  </span>
                </button>
              )
            })}

            {drawing && (
              <div
                className="absolute border-2 border-dashed border-blue-500 bg-blue-500/10 pointer-events-none"
                style={{
                  left: drawing.w < 0 ? drawing.x + drawing.w : drawing.x,
                  top: drawing.h < 0 ? drawing.y + drawing.h : drawing.y,
                  width: Math.abs(drawing.w),
                  height: Math.abs(drawing.h),
                }}
              />
            )}
          </div>
        </div>
      </div>

      <aside className="lg:w-80 shrink-0 flex flex-col gap-3">
        {current ? (
          <div className="rounded-lg border-2 border-gray-200 dark:border-gray-700 p-3 space-y-2.5">
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">This box holds</p>

            <select
              value={current.columnKey ? `${current.fieldKey}.${current.columnKey}` : current.fieldKey}
              onChange={(e) => {
                const [fieldKey, columnKey] = e.target.value.split(".")
                update(current.id, { fieldKey: fieldKey || "", columnKey: columnKey || undefined })
              }}
              className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded text-xs bg-white dark:bg-gray-800"
            >
              <option value="">Not assigned yet</option>
              {fields.map((field) =>
                field.type === "table" ? (
                  <optgroup key={field.key} label={field.label}>
                    {field.columns.map((column) => (
                      <option key={column.key} value={`${field.key}.${column.key}`}>
                        {column.label}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                )
              )}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-gray-600 dark:text-gray-300">
                Alignment
                <select
                  value={current.align}
                  onChange={(e) => update(current.id, { align: e.target.value as Placement["align"] })}
                  className="mt-0.5 w-full px-2 py-1 border border-gray-200 dark:border-gray-700 rounded text-xs bg-white dark:bg-gray-800"
                >
                  <option value="left">Left</option>
                  <option value="center">Centre</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label className="text-[11px] text-gray-600 dark:text-gray-300">
                Text size
                <input
                  type="number"
                  min={5}
                  max={24}
                  step={0.5}
                  value={current.fontSize}
                  onChange={(e) => update(current.id, { fontSize: Number(e.target.value) || 10 })}
                  className="mt-0.5 w-full px-2 py-1 border border-gray-200 dark:border-gray-700 rounded text-xs bg-white dark:bg-gray-800"
                />
              </label>
            </div>

            {current.columnKey && (
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
                <label className="text-[11px] text-gray-600 dark:text-gray-300">
                  Row spacing (pt)
                  <input
                    type="number"
                    min={6}
                    step={0.5}
                    value={tableSettings[current.fieldKey]?.rowHeight ?? Math.round(current.box.height)}
                    onChange={(e) =>
                      setTableSettings((prev) => ({
                        ...prev,
                        [current.fieldKey]: {
                          rowHeight: Number(e.target.value) || current.box.height,
                          maxRows: prev[current.fieldKey]?.maxRows ?? 3,
                        },
                      }))
                    }
                    className="mt-0.5 w-full px-2 py-1 border border-gray-200 dark:border-gray-700 rounded text-xs bg-white dark:bg-gray-800"
                  />
                </label>
                <label className="text-[11px] text-gray-600 dark:text-gray-300">
                  Rows on the form
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={tableSettings[current.fieldKey]?.maxRows ?? 3}
                    onChange={(e) =>
                      setTableSettings((prev) => ({
                        ...prev,
                        [current.fieldKey]: {
                          rowHeight: prev[current.fieldKey]?.rowHeight ?? current.box.height,
                          maxRows: Number(e.target.value) || 3,
                        },
                      }))
                    }
                    className="mt-0.5 w-full px-2 py-1 border border-gray-200 dark:border-gray-700 rounded text-xs bg-white dark:bg-gray-800"
                  />
                </label>
              </div>
            )}

            <Button
              size="sm"
              variant="outline"
              className="w-full text-red-600 hover:text-red-700"
              onClick={() => {
                setPlacements((prev) => prev.filter((p) => p.id !== current.id))
                setSelected(null)
              }}
            >
              <Trash2 size={13} className="mr-1" /> Remove this box
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 p-4 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Drag a box on the form, or click one you have already drawn.
            </p>
          </div>
        )}

        <div className="rounded-lg border-2 border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">
            Still to place ({unmapped.length})
          </p>
          {unmapped.length === 0 ? (
            <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
              Every field has a position. Stamping can be switched on.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {unmapped.map((field) => (
                <li key={field.key} className="text-[11px] text-gray-600 dark:text-gray-400">
                  {field.label}
                  {field.type === "table" && ` (${field.columns.length} columns)`}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button size="sm" variant="outline" onClick={preview} disabled={previewing || saving}>
            {previewing ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Eye size={13} className="mr-1" />}
            Preview with sample values
          </Button>
          <Button size="sm" variant="outline" onClick={() => save("html")} disabled={saving}>
            Save positions only
          </Button>
          <Button size="sm" onClick={() => save("pdf-overlay")} disabled={saving || unmapped.length > 0}>
            {saving && <Loader2 size={13} className="mr-1 animate-spin" />}
            Save and stamp onto the court&apos;s PDF
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
            Close
          </Button>
        </div>
      </aside>
    </div>
  )
}
