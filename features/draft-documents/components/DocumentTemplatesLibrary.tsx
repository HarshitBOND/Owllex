"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, FileStack, LayoutGrid, List, Search, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { styleFor } from "../category-styles"
import TemplateDetailSheet from "./TemplateDetailSheet"

type LibraryTemplate = {
  id: string
  title: string
  description: string
  category: string
  usageCount: number
  /** Zero means a plain body: it opens straight in the editor, as it always did. */
  fieldCount?: number
}

export default function DocumentTemplatesLibrary({
  initialCorpusId,
  initialCaseId,
}: {
  /** Set when the library was opened from a corpus or a case, so autofill can run at once. */
  initialCorpusId?: string
  initialCaseId?: string
} = {}) {
  const router = useRouter()

  const [templates, setTemplates] = useState<LibraryTemplate[]>([])
  const [categories, setCategories] = useState<{ category: string; count: number }[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("All")
  const [sort, setSort] = useState<"popular" | "az">("popular")
  const [view, setView] = useState<"grid" | "list">("grid")
  const [describe, setDescribe] = useState("")
  const [openTemplate, setOpenTemplate] = useState<string | null>(null)

  const fetchTemplates = useCallback(async (q: string, cat: string, order: string) => {
    try {
      setLoading(true)
      const p = new URLSearchParams({ sort: order })
      if (q) p.set("q", q)
      if (cat !== "All") p.set("category", cat)
      const res = await fetch(`/api/document-templates?${p}`)
      const data = await res.json()
      if (data.success) {
        setTemplates(data.templates)
        setCategories(data.categories)
        setTotal(data.total)
      }
    } catch (err) {
      console.error("Template library fetch error:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => fetchTemplates(search.trim(), category, sort), 300)
    return () => clearTimeout(t)
  }, [search, category, sort, fetchTemplates])

  const useTemplate = (id: string) => setOpenTemplate(id)

  const submitDescription = () => {
    const text = describe.trim()
    if (!text) return
    router.push(`/draft-documents/new?prompt=${encodeURIComponent(text)}`)
  }

  const allCount = categories.reduce((sum, c) => sum + c.count, 0)
  const libraryIsEmpty = allCount === 0 && !loading

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-64 shrink-0 flex flex-col gap-4">
          <nav className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden lg:overflow-visible">
            <div className="flex lg:flex-col overflow-x-auto lg:overflow-visible p-1.5 lg:p-2 gap-1">
              <button
                type="button"
                onClick={() => setCategory("All")}
                className={cn(
                  "shrink-0 flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-left transition-colors whitespace-nowrap",
                  category === "All"
                    ? "bg-accent/10 text-accent font-semibold"
                    : "text-gray-600 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-secondary/60"
                )}
              >
                <span>All templates</span>
                <span className="text-xs text-gray-400">{allCount}</span>
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.category}
                  type="button"
                  onClick={() => setCategory(cat.category)}
                  className={cn(
                    "shrink-0 flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-left transition-colors whitespace-nowrap",
                    category === cat.category
                      ? "bg-accent/10 text-accent font-semibold"
                      : "text-gray-600 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-secondary/60"
                  )}
                >
                  <span>{cat.category}</span>
                  <span className="text-xs text-gray-400">{cat.count}</span>
                </button>
              ))}
            </div>
          </nav>

          <div className="hidden lg:flex flex-col gap-2 rounded-xl border border-gray-200 dark:border-border bg-accent/5 p-4">
            <span className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
              <Sparkles className="w-4 h-4" />
            </span>
            <p className="text-sm font-semibold text-gray-900 dark:text-foreground mt-1">Need something custom?</p>
            <p className="text-xs text-gray-500 dark:text-muted-foreground">
              Describe what you need and the AI assistant will draft it for you.
            </p>
            <textarea
              value={describe}
              onChange={(e) => setDescribe(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitDescription()
              }}
              rows={3}
              placeholder="A leave and licence agreement for a Mumbai flat, 11 months, with a lock-in period..."
              className="mt-1 w-full rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card px-3 py-2 text-xs text-gray-900 dark:text-foreground placeholder:text-gray-400 outline-none resize-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <button
              type="button"
              onClick={submitDescription}
              disabled={!describe.trim()}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-gray-900 dark:text-foreground border border-gray-200 dark:border-border rounded-lg px-3 py-2 hover:bg-white dark:hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Draft this document
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates by name, type, or keyword..."
                className="w-full h-10 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card pl-9 pr-3 text-sm text-gray-900 dark:text-foreground placeholder:text-gray-400 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card px-3 text-sm text-gray-700 dark:text-foreground outline-none cursor-pointer"
            >
              <option value="All">All categories</option>
              {categories.map((cat) => (
                <option key={cat.category} value={cat.category}>
                  {cat.category}
                </option>
              ))}
            </select>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as "popular" | "az")}
              className="h-10 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card px-3 text-sm text-gray-700 dark:text-foreground outline-none cursor-pointer"
            >
              <option value="popular">Most used</option>
              <option value="az">A–Z</option>
            </select>

            <div className="flex items-center rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card p-1 gap-1 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setView("grid")}
                aria-label="Grid view"
                className={cn(
                  "w-8 h-8 rounded-md flex items-center justify-center transition-colors",
                  view === "grid" ? "bg-accent/10 text-accent" : "text-gray-400 hover:text-gray-600"
                )}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                aria-label="List view"
                className={cn(
                  "w-8 h-8 rounded-md flex items-center justify-center transition-colors",
                  view === "list" ? "bg-accent/10 text-accent" : "text-gray-400 hover:text-gray-600"
                )}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-muted-foreground">
            {loading ? "Loading templates..." : `${total} ${total === 1 ? "template" : "templates"} found`}
          </p>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-4 min-h-[168px] animate-pulse"
                >
                  <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-secondary" />
                  <div className="h-3.5 w-3/4 bg-gray-100 dark:bg-secondary rounded mt-4" />
                  <div className="h-3 w-full bg-gray-100 dark:bg-secondary rounded mt-2" />
                  <div className="h-3 w-1/2 bg-gray-100 dark:bg-secondary rounded mt-2" />
                </div>
              ))}
            </div>
          ) : libraryIsEmpty ? (
            <div className="rounded-xl border border-dashed border-gray-200 dark:border-border bg-white dark:bg-card py-16 flex flex-col items-center justify-center text-center gap-2 px-6">
              <FileStack className="w-8 h-8 text-gray-300 dark:text-gray-600" />
              <p className="text-sm font-semibold text-gray-900 dark:text-foreground">No templates published yet</p>
              <p className="text-xs text-gray-500 dark:text-muted-foreground max-w-sm">
                Your firm&apos;s administrator adds templates from the admin panel. In the meantime you can start a
                blank document and draft it with the AI assistant.
              </p>
              <button
                type="button"
                onClick={() => router.push("/draft-documents/new")}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-white bg-accent rounded-lg px-3 py-2 hover:opacity-90 transition-opacity"
              >
                Start from scratch
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : templates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 dark:border-border bg-white dark:bg-card py-16 flex flex-col items-center justify-center text-center gap-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-foreground">No templates found</p>
              <p className="text-xs text-gray-500 dark:text-muted-foreground">
                Try a different search term or category.
              </p>
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {templates.map((template) => {
                const style = styleFor(template.category)
                return (
                  <div
                    key={template.id}
                    className="group text-left rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card hover:border-accent/40 hover:shadow-sm transition-all p-4 flex flex-col min-h-[168px]"
                  >
                    <div className="flex items-start justify-between">
                      <span className={cn("w-9 h-9 rounded-lg flex items-center justify-center", style.bgColor)}>
                        <style.icon className={cn("w-4 h-4", style.color)} />
                      </span>
                      {template.usageCount > 0 && (
                        <span className="text-[11px] text-gray-400">Used {template.usageCount}×</span>
                      )}
                    </div>
                    <span className="flex-1 mt-3">
                      <span className="block text-sm font-semibold text-gray-900 dark:text-foreground">
                        {template.title}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-muted-foreground mt-1">
                        {template.description}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "inline-flex self-start items-center rounded-full text-[11px] font-medium px-2 py-0.5 mt-3",
                        style.bgColor,
                        style.color
                      )}
                    >
                      {template.category}
                    </span>
                    <button
                      type="button"
                      onClick={() => useTemplate(template.id)}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline self-start"
                    >
                      {template.fieldCount ? "Fill this in" : "Use template"}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden">
              {templates.map((template, i) => {
                const style = styleFor(template.category)
                return (
                  <div
                    key={template.id}
                    className={cn(
                      "flex items-center gap-4 px-5 py-3",
                      i !== templates.length - 1 && "border-b border-gray-100 dark:border-border"
                    )}
                  >
                    <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", style.bgColor)}>
                      <style.icon className={cn("w-4 h-4", style.color)} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-foreground truncate">{template.title}</p>
                      <p className="text-xs text-gray-500 dark:text-muted-foreground truncate">{template.description}</p>
                    </div>
                    <span
                      className={cn(
                        "hidden sm:inline-flex shrink-0 items-center rounded-full text-[11px] font-medium px-2 py-0.5",
                        style.bgColor,
                        style.color
                      )}
                    >
                      {template.category}
                    </span>
                    <button
                      type="button"
                      onClick={() => useTemplate(template.id)}
                      className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                    >
                      {template.fieldCount ? "Fill this in" : "Use template"}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <TemplateDetailSheet
        templateId={openTemplate}
        initialCorpusId={initialCorpusId}
        initialCaseId={initialCaseId}
        onClose={() => setOpenTemplate(null)}
      />
    </>
  )
}