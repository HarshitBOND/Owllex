"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Check,
  CornerDownLeft,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { renderTemplate, missingRequired, type FieldValues } from "@/lib/templates/render"
import type { TemplateColumn, TemplateField } from "@/lib/templates/fields"

/**
 * Fills a court form one question at a time.
 *
 * Answered questions stay on screen as a trail rather than disappearing, so the
 * advocate can see what they have already settled and correct it without losing
 * their place -- and anything the case record or the corpus already knew arrives
 * pre-answered in that trail, badged with where it came from, instead of being
 * asked again.
 */

export type Provenance = Record<string, { source: string; documentId?: string; quote?: string }>

const SOURCE_LABEL: Record<string, string> = {
  case: "from the case",
  corpusFact: "from an earlier form",
  corpusDoc: "from your documents",
  ai: "drafted by AI",
}

function isAnswered(field: TemplateField, values: FieldValues) {
  if (field.type === "table") {
    const rows = values[field.key]
    return (
      Array.isArray(rows) &&
      rows.some((row) => Object.values(row as object).some((v) => String(v ?? "").trim()))
    )
  }
  return !!String(values[field.key] ?? "").trim()
}

function summarise(field: TemplateField, values: FieldValues): string {
  if (field.type === "table") {
    const rows = Array.isArray(values[field.key]) ? (values[field.key] as Record<string, unknown>[]) : []
    const first = field.columns[0]?.key
    const names = rows
      .map((r) => String(r?.[first ?? ""] ?? "").trim())
      .filter(Boolean)
    if (names.length === 0) return `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`
    return names.join(", ")
  }
  return String(values[field.key] ?? "")
}

function TableRows({
  field,
  rows,
  onChange,
  disabled,
}: {
  field: TemplateField
  rows: Record<string, unknown>[]
  onChange: (rows: Record<string, unknown>[]) => void
  disabled?: boolean
}) {
  const blank = () => Object.fromEntries(field.columns.map((c) => [c.key, ""]))
  const list = rows.length > 0 ? rows : [blank()]

  const setCell = (index: number, column: TemplateColumn, value: string) => {
    onChange(list.map((row, i) => (i === index ? { ...row, [column.key]: value } : row)))
  }

  return (
    <div className="flex flex-col gap-3">
      {list.map((row, index) => (
        <div
          key={index}
          className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
              Entry {index + 1}
            </span>
            {list.length > 1 && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(list.filter((_, i) => i !== index))}
                aria-label={`Remove entry ${index + 1}`}
                className="text-gray-400 hover:text-red-600 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {field.columns.map((column) => (
              <label key={column.key} className="flex flex-col gap-1">
                <span className="text-xs text-gray-600 dark:text-muted-foreground">
                  {column.label}
                  {column.required && <span className="text-red-500 ml-0.5">*</span>}
                </span>
                <input
                  type={column.type === "date" ? "date" : column.type === "number" ? "number" : "text"}
                  value={String(row?.[column.key] ?? "")}
                  disabled={disabled}
                  onChange={(e) => setCell(index, column, e.target.value)}
                  className="h-9 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card px-3 text-sm text-gray-900 dark:text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </label>
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...list, blank()])}
        className="self-start inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
      >
        <Plus className="w-3.5 h-3.5" />
        Add another {(field.label || "entry").toLowerCase().replace(/s$/, "")}
      </button>
    </div>
  )
}

export default function TemplateWizard({
  title,
  bodyHtml,
  fields,
  initialValues = {},
  initialProvenance = {},
  autofillNote,
  autofilling = false,
  submitting = false,
  error = "",
  corpusLinked = false,
  remember,
  onRememberChange,
  onSubmit,
  onCancel,
}: {
  title: string
  bodyHtml: string
  fields: TemplateField[]
  initialValues?: FieldValues
  initialProvenance?: Provenance
  autofillNote?: string
  autofilling?: boolean
  submitting?: boolean
  error?: string
  corpusLinked?: boolean
  remember?: boolean
  onRememberChange?: (next: boolean) => void
  onSubmit: (values: FieldValues, provenance: Provenance) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<FieldValues>(initialValues)
  const [provenance, setProvenance] = useState<Provenance>(initialProvenance)
  const [step, setStep] = useState(0)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null)

  // Autofill lands after the wizard has already mounted, so the answers and the
  // starting step both have to catch up when it arrives.
  useEffect(() => {
    if (Object.keys(initialValues).length === 0) return
    setValues((prev) => ({ ...initialValues, ...prev }))
    setProvenance((prev) => ({ ...initialProvenance, ...prev }))
  }, [initialValues, initialProvenance])

  const firstUnanswered = useMemo(() => {
    const index = fields.findIndex((f) => !isAnswered(f, values))
    return index === -1 ? fields.length : index
  }, [fields, values])

  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current || autofilling || fields.length === 0) return
    startedRef.current = true
    setStep(firstUnanswered)
  }, [autofilling, firstUnanswered, fields.length])

  useEffect(() => {
    inputRef.current?.focus()
  }, [step])

  const field = fields[step] as TemplateField | undefined
  const atEnd = step >= fields.length

  const setValue = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    // Typing over an autofilled answer makes it the advocate's own, which is
    // what decides whether it may be written back to the corpus later.
    setProvenance((prev) => ({ ...prev, [key]: { source: "user" } }))
  }, [])

  const remaining = missingRequired(fields, values)
  const canFinish = remaining.length === 0

  const next = useCallback(() => setStep((s) => Math.min(s + 1, fields.length)), [fields.length])
  const back = useCallback(() => setStep((s) => Math.max(s - 1, 0)), [])

  const preview = useMemo(() => renderTemplate(bodyHtml, fields, values), [bodyHtml, fields, values])

  const answeredCount = fields.filter((f) => isAnswered(f, values)).length

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4">
      <div className="flex-1 min-w-0 flex flex-col rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-border bg-gray-50/70 dark:bg-secondary/30">
          <div className="flex gap-1" aria-hidden>
            {fields.map((f, i) => (
              <span
                key={f.key}
                className={cn(
                  "h-[3px] w-4 rounded-full transition-colors",
                  isAnswered(f, values) ? "bg-accent" : i === step ? "bg-accent/40" : "bg-gray-200 dark:bg-secondary"
                )}
              />
            ))}
          </div>
          <span className="ml-auto text-[11px] font-mono text-gray-500 dark:text-muted-foreground tabular-nums">
            {answeredCount} / {fields.length} · {title}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 py-4">
          {autofilling && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
              <p className="text-xs text-gray-700 dark:text-foreground">
                Reading your case documents to fill in what we can...
              </p>
            </div>
          )}

          {!autofilling && autofillNote && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
              <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent" />
              <p className="text-xs text-gray-700 dark:text-foreground">{autofillNote}</p>
            </div>
          )}

          {/* The trail. Everything already settled stays visible and clickable. */}
          <div className="flex flex-col gap-1.5 mb-5">
            {fields.slice(0, step).map((f, i) => {
              const answered = isAnswered(f, values)
              const source = provenance[f.key]?.source
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStep(i)}
                  className="group flex items-baseline gap-2.5 text-left rounded px-1 -mx-1 py-0.5 hover:bg-gray-50 dark:hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Check
                    className={cn(
                      "w-3 h-3 shrink-0 translate-y-0.5",
                      answered ? "text-accent" : "text-gray-300 dark:text-gray-600"
                    )}
                  />
                  <span className="text-[13px] text-gray-500 dark:text-muted-foreground shrink-0">
                    {f.label}
                  </span>
                  <span
                    className={cn(
                      "text-[13px] min-w-0 truncate",
                      answered
                        ? source && source !== "user"
                          ? "text-accent"
                          : "text-gray-800 dark:text-foreground"
                        : "text-gray-400 italic"
                    )}
                  >
                    {answered ? summarise(f, values) : "skipped"}
                  </span>
                  {answered && source && source !== "user" && (
                    <span className="text-[10px] uppercase tracking-wide text-gray-400 shrink-0">
                      {SOURCE_LABEL[source] ?? source}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {atEnd ? (
            <div>
              <p className="font-serif text-xl font-semibold text-gray-900 dark:text-foreground">
                {canFinish ? "That's everything." : "A few answers are still needed."}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-muted-foreground">
                {canFinish
                  ? "Create the document and you can edit anything by hand afterwards."
                  : `Still required: ${remaining.map((f) => f.label).join(", ")}.`}
              </p>

              {/* These are a client's personal details, so keeping them is the
                  advocate's decision and it is made here, in plain sight. */}
              {corpusLinked && (
                <label className="mt-4 flex items-start gap-2.5 rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remember ?? true}
                    disabled={submitting}
                    onChange={(e) => onRememberChange?.(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900 dark:text-foreground">
                      Remember these details in this corpus
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-muted-foreground mt-0.5">
                      The next form you draft for this matter will arrive already filled in. You can
                      review or forget what is remembered at any time.
                    </span>
                  </span>
                </label>
              )}
            </div>
          ) : field ? (
            <div>
              <p className="font-serif text-xl font-semibold text-gray-900 dark:text-foreground text-balance">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </p>
              {field.help && (
                <p className="mt-1 text-[13px] text-gray-500 dark:text-muted-foreground">{field.help}</p>
              )}

              <div className="mt-3">
                {field.type === "table" ? (
                  <TableRows
                    field={field}
                    rows={Array.isArray(values[field.key]) ? (values[field.key] as Record<string, unknown>[]) : []}
                    onChange={(rows) => setValue(field.key, rows)}
                    disabled={submitting}
                  />
                ) : field.type === "select" ? (
                  <select
                    ref={(el) => {
                      inputRef.current = el
                    }}
                    value={String(values[field.key] ?? "")}
                    disabled={submitting}
                    onChange={(e) => setValue(field.key, e.target.value)}
                    className="w-full h-11 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card px-3 text-[15px] text-gray-900 dark:text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <option value="">Choose one...</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : field.type === "longtext" ? (
                  <textarea
                    ref={(el) => {
                      inputRef.current = el
                    }}
                    value={String(values[field.key] ?? "")}
                    disabled={submitting}
                    rows={5}
                    onChange={(e) => setValue(field.key, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) next()
                    }}
                    className="w-full rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card px-3 py-2.5 text-[15px] text-gray-900 dark:text-foreground outline-none resize-y focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                ) : (
                  <input
                    ref={(el) => {
                      inputRef.current = el
                    }}
                    type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
                    value={String(values[field.key] ?? "")}
                    disabled={submitting}
                    onChange={(e) => setValue(field.key, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        next()
                      }
                    }}
                    className="w-full h-11 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card px-3 text-[15px] text-gray-900 dark:text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                )}
              </div>

              {provenance[field.key]?.quote && (
                <p className="mt-2 text-[11px] text-gray-500 dark:text-muted-foreground border-l-2 border-accent/40 pl-2">
                  From your documents: &ldquo;{provenance[field.key]?.quote}&rdquo;
                </p>
              )}
            </div>
          ) : null}

          {error && <p className="mt-3 text-[13px] text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100 dark:border-border">
          {atEnd ? (
            <button
              type="button"
              onClick={() => onSubmit(values, provenance)}
              disabled={submitting || !canFinish}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create the document
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {step === fields.length - 1 ? "Review" : "Next"}
            </button>
          )}

          <button
            type="button"
            onClick={step === 0 ? onCancel : back}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 dark:border-border text-sm text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-secondary transition-colors disabled:opacity-40"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {step === 0 ? "Cancel" : "Back"}
          </button>

          {!atEnd && field && !field.required && (
            <button
              type="button"
              onClick={next}
              disabled={submitting}
              className="text-xs text-gray-500 dark:text-muted-foreground hover:text-gray-800 dark:hover:text-foreground transition-colors"
            >
              Skip
            </button>
          )}

          <span className="ml-auto hidden sm:flex items-center gap-1 text-[11px] font-mono text-gray-400">
            <CornerDownLeft className="w-3 h-3" />
            to continue
          </span>
        </div>
      </div>

      {/* The document as it stands, so the advocate sees the form fill in. */}
      <aside className="hidden lg:flex lg:w-[42%] xl:w-[46%] shrink-0 flex-col rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-border bg-gray-50/70 dark:bg-secondary/30">
          <FileText className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-gray-500 dark:text-muted-foreground">
            Preview
          </span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6">
          {/*
            Safe to inject: bodyHtml was passed through sanitizeDocumentHtml when
            the template was saved, and renderTemplate HTML-escapes every value
            it substitutes, so nothing an advocate or a document can type gets
            here as markup.
          */}
          <div
            className="prose prose-sm dark:prose-invert max-w-none [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_th]:border [&_td]:border-gray-300 [&_th]:border-gray-300 [&_td]:p-1.5 [&_th]:p-1.5 dark:[&_td]:border-gray-700 dark:[&_th]:border-gray-700"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        </div>
      </aside>
    </div>
  )
}
