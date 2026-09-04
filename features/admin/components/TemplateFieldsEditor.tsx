"use client"

import { AlertTriangle, ChevronDown, ChevronRight, Table2 } from "lucide-react"
import { useState } from "react"
import { CASE_SOURCES, CASE_SOURCE_LABELS } from "@/lib/templates/case-source"
import { FIELD_TYPES, type TemplateField } from "@/lib/templates/fields"

/**
 * The field list an admin corrects after an import.
 *
 * Keys are deliberately not editable here. A key is what ties a field to its
 * {{token}} in the body, to the values on every draft already made from the
 * template, and to the facts stored in a corpus -- renaming one in a table like
 * this would break all three silently. Renaming is a body edit.
 */

const TYPE_HINTS: Record<string, string> = {
  text: "A single line",
  longtext: "A paragraph",
  date: "A date",
  number: "An amount or count",
  select: "One of a fixed set of choices",
  table: "Rows the advocate can add to",
}

export function TemplateFieldsEditor({
  fields,
  onChange,
  parityErrors = [],
  disabled = false,
}: {
  fields: TemplateField[]
  onChange: (fields: TemplateField[]) => void
  parityErrors?: string[]
  disabled?: boolean
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const update = (index: number, changes: Partial<TemplateField>) => {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...changes } : f)))
  }

  if (fields.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 px-4 py-6 text-center">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">No fillable fields</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          This template opens straight in the editor with nothing to fill in. Add{" "}
          <code className="rounded bg-gray-100 dark:bg-gray-800 px-1">{"{{tokens}}"}</code> to the body to
          give it a guided fill.
        </p>
      </div>
    )
  }

  const groups = [...new Set(fields.map((f) => f.group || "Ungrouped"))]

  return (
    <div className="space-y-3">
      {parityErrors.length > 0 && (
        <div className="rounded-lg border-2 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-600 dark:text-amber-500 shrink-0" />
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              The body and this field list don&apos;t agree yet
            </p>
          </div>
          <ul className="mt-2 space-y-1 pl-6 list-disc">
            {parityErrors.map((error) => (
              <li key={error} className="text-xs text-amber-800 dark:text-amber-300">
                {error}
              </li>
            ))}
          </ul>
          <p className="mt-2 pl-6 text-[11px] text-amber-700 dark:text-amber-400">
            You can save this as a draft, but it can&apos;t be published until they match.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {fields.length} {fields.length === 1 ? "field" : "fields"} across{" "}
          {groups.length} {groups.length === 1 ? "section" : "sections"}
        </p>
      </div>

      <div className="rounded-lg border-2 border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
        {fields.map((field, index) => {
          const isOpen = expanded === field.key
          return (
            <div key={field.key} className="bg-white dark:bg-gray-900">
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : field.key)}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? `Collapse ${field.label}` : `Expand ${field.label}`}
                  className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>

                <input
                  value={field.label}
                  disabled={disabled}
                  onChange={(e) => update(index, { label: e.target.value })}
                  aria-label={`Label for ${field.key}`}
                  className="flex-1 min-w-0 bg-transparent text-sm font-medium text-gray-900 dark:text-gray-100 border-b border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus:border-blue-500 outline-none py-0.5"
                />

                <code className="hidden sm:block shrink-0 text-[11px] text-gray-400 font-mono">
                  {field.key}
                </code>

                {field.type === "table" && (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                    <Table2 size={10} />
                    {field.columns.length} cols
                  </span>
                )}

                <select
                  value={field.type}
                  disabled={disabled}
                  onChange={(e) => update(index, { type: e.target.value as TemplateField["type"] })}
                  aria-label={`Type for ${field.label}`}
                  className="shrink-0 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-1 text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                <label className="shrink-0 flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={field.required}
                    disabled={disabled}
                    onChange={(e) => update(index, { required: e.target.checked })}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  Required
                </label>
              </div>

              {isOpen && (
                <div className="px-3 pb-3 pt-1 pl-10 grid gap-3 sm:grid-cols-2 bg-gray-50/60 dark:bg-gray-950/30">
                  <div className="sm:col-span-2">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{TYPE_HINTS[field.type]}</p>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
                      Helper text
                    </label>
                    <input
                      value={field.help}
                      disabled={disabled}
                      onChange={(e) => update(index, { help: e.target.value })}
                      placeholder="Only if the label alone isn't clear"
                      className="mt-1 w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded text-xs bg-white dark:bg-gray-800 outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
                      Section
                    </label>
                    <input
                      value={field.group}
                      disabled={disabled}
                      onChange={(e) => update(index, { group: e.target.value })}
                      placeholder="Case details"
                      className="mt-1 w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded text-xs bg-white dark:bg-gray-800 outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>

                  {field.type !== "table" && (
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
                        Fill from the case record
                      </label>
                      <select
                        value={field.source ?? ""}
                        disabled={disabled}
                        onChange={(e) => update(index, { source: e.target.value || null })}
                        className="mt-1 w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30"
                      >
                        <option value="">Always ask the advocate</option>
                        {CASE_SOURCES.map((source) => (
                          <option key={source} value={source}>
                            {CASE_SOURCE_LABELS[source]}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[10px] text-gray-400">
                        If the linked case has no value here, the advocate is asked anyway.
                      </p>
                    </div>
                  )}

                  {field.type === "select" && (
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
                        Choices, one per line &mdash; use the form&apos;s own wording
                      </label>
                      <textarea
                        value={field.options.join("\n")}
                        disabled={disabled}
                        rows={3}
                        onChange={(e) =>
                          update(index, {
                            options: e.target.value.split("\n").map((o) => o.trim()).filter(Boolean),
                          })
                        }
                        className="mt-1 w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded text-xs bg-white dark:bg-gray-800 outline-none focus:ring-2 focus:ring-blue-500/30 resize-y"
                      />
                    </div>
                  )}

                  {field.type === "table" && (
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
                        Columns, left to right
                      </label>
                      <div className="mt-1 rounded border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                        {field.columns.map((col, ci) => (
                          <div key={col.key} className="flex items-center gap-2 px-2 py-1.5">
                            <input
                              value={col.label}
                              disabled={disabled}
                              onChange={(e) =>
                                update(index, {
                                  columns: field.columns.map((c, i) =>
                                    i === ci ? { ...c, label: e.target.value } : c
                                  ),
                                })
                              }
                              aria-label={`Heading for column ${col.key}`}
                              className="flex-1 min-w-0 bg-transparent text-xs text-gray-800 dark:text-gray-100 outline-none border-b border-transparent focus:border-blue-500"
                            />
                            <code className="text-[10px] text-gray-400 font-mono shrink-0">{col.key}</code>
                            <label className="shrink-0 flex items-center gap-1 text-[10px] text-gray-500">
                              <input
                                type="checkbox"
                                checked={col.required}
                                disabled={disabled}
                                onChange={(e) =>
                                  update(index, {
                                    columns: field.columns.map((c, i) =>
                                      i === ci ? { ...c, required: e.target.checked } : c
                                    ),
                                  })
                                }
                                className="rounded border-gray-300 dark:border-gray-600"
                              />
                              Req
                            </label>
                          </div>
                        ))}
                      </div>
                      <p className="mt-1 text-[10px] text-gray-400">
                        The body holds one row of{" "}
                        <code className="font-mono">{`{{${field.key}.column}}`}</code> tokens; it repeats
                        once per entry the advocate adds.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function fieldSummary(fields: TemplateField[] | undefined) {
  if (!fields || fields.length === 0) return "No fillable fields"
  const tables = fields.filter((f) => f.type === "table").length
  const sourced = fields.filter((f) => f.source).length
  const parts = [`${fields.length} ${fields.length === 1 ? "field" : "fields"}`]
  if (tables > 0) parts.push(`${tables} ${tables === 1 ? "table" : "tables"}`)
  if (sourced > 0) parts.push(`${sourced} from the case`)
  return parts.join(" · ")
}
