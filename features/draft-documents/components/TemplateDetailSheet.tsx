"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Briefcase,
  ExternalLink,
  FileWarning,
  Library,
  ListChecks,
  Loader2,
  Sparkles,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

type TemplateDetail = {
  id: string
  title: string
  description: string
  category: string
  version: number
  fields: { key: string; label: string; required: boolean; type: string }[]
  hasSourcePdf: boolean
  sourceFilename: string
  sourcePageCount: number
}

type CorpusOption = { corpusId: string; name: string; caseIds: string[] }
type CaseOption = { id: string; label: string }

/**
 * What opens when an advocate picks a form.
 *
 * The court's own PDF sits alongside the choices, because the first question
 * anybody has about a form is whether it is the right one -- and the only
 * convincing answer is the document the registry actually issues.
 */
export default function TemplateDetailSheet({
  templateId,
  initialCorpusId,
  initialCaseId,
  onClose,
}: {
  templateId: string | null
  initialCorpusId?: string
  initialCaseId?: string
  onClose: () => void
}) {
  const router = useRouter()

  const [detail, setDetail] = useState<TemplateDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [pdfUrl, setPdfUrl] = useState("")
  const [pdfError, setPdfError] = useState("")

  const [corpora, setCorpora] = useState<CorpusOption[]>([])
  const [cases, setCases] = useState<CaseOption[]>([])
  const [corpusId, setCorpusId] = useState(initialCorpusId ?? "")
  const [caseId, setCaseId] = useState(initialCaseId ?? "")
  const [starting, setStarting] = useState<"wizard" | "ai" | "blank" | null>(null)

  useEffect(() => {
    if (!templateId) {
      setDetail(null)
      setPdfUrl("")
      setPdfError("")
      setError("")
      return
    }

    let cancelled = false
    setLoading(true)
    setError("")

    fetch(`/api/document-templates/${templateId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.success) setDetail(data.template)
        else setError(data.error || "This form could not be opened.")
      })
      .catch(() => !cancelled && setError("Could not reach the server."))
      .finally(() => !cancelled && setLoading(false))

    fetch(`/api/document-templates/${templateId}/source`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.success) setPdfUrl(data.url)
        else setPdfError(data.error || "")
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [templateId])

  // Loaded once the sheet opens, so linking a matter is a dropdown rather than
  // a separate trip through the app.
  useEffect(() => {
    if (!templateId) return
    fetch("/api/corpus")
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data?.corpora)) return
        // The list route exposes the corpus id as `id`; everything downstream
        // takes it as `corpusId`.
        const list = data.corpora as {
          id: string
          name: string
          archived?: boolean
          caseIds?: string[]
        }[]
        setCorpora(
          list
            .filter((c) => !c.archived)
            .map((c) => ({ corpusId: c.id, name: c.name, caseIds: c.caseIds ?? [] }))
        )
      })
      .catch(() => {})

    fetch("/api/userdetails/cases")
      .then((res) => res.json())
      .then((data) => {
        const rows = data?.userCases?.cases
        if (!Array.isArray(rows)) return
        setCases(
          rows
            .slice(0, 100)
            .map((c: Record<string, unknown>) => ({
              id: String(c._id),
              label: [c.caseNo, c.caseTitle].filter(Boolean).join(" — ") || "Untitled case",
            }))
        )
      })
      .catch(() => {})
  }, [templateId])

  /**
   * Links the corpus that already covers the chosen case.
   *
   * Arriving from a case, the matter is known -- asking the advocate to find
   * the same matter again in a second dropdown is work the app can do itself.
   * Only fills an empty choice, so an explicit selection is never overridden.
   */
  useEffect(() => {
    if (!caseId || corpusId || corpora.length === 0) return
    const owning = corpora.find((c) => c.caseIds.includes(caseId))
    if (owning) setCorpusId(owning.corpusId)
  }, [caseId, corpusId, corpora])

  /** And the reverse: a corpus covering exactly one case names that case. */
  useEffect(() => {
    if (!corpusId || caseId) return
    const chosen = corpora.find((c) => c.corpusId === corpusId)
    if (chosen?.caseIds.length === 1) setCaseId(chosen.caseIds[0])
  }, [corpusId, caseId, corpora])

  const start = useCallback(
    (mode: "wizard" | "ai" | "blank") => {
      if (!templateId) return
      setStarting(mode)
      const params = new URLSearchParams({ templateId })
      if (mode !== "blank") params.set("mode", mode)
      if (corpusId) params.set("corpusId", corpusId)
      if (caseId) params.set("caseId", caseId)
      router.push(`/draft-documents/new?${params}`)
    },
    [templateId, corpusId, caseId, router]
  )

  if (!templateId) return null

  const fillable = (detail?.fields.length ?? 0) > 0

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={detail?.title || "Form"}
        className="relative ml-auto h-full w-full max-w-3xl bg-[#F3F5F9] dark:bg-background shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        <header className="flex items-start gap-3 px-5 py-4 border-b border-gray-200 dark:border-border bg-white dark:bg-card">
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="h-5 w-48 rounded bg-gray-100 dark:bg-secondary animate-pulse" />
            ) : (
              <>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-foreground truncate">
                  {detail?.title || "Form"}
                </h2>
                <p className="text-xs text-gray-500 dark:text-muted-foreground mt-0.5">
                  {detail?.category}
                  {detail ? ` · v${detail.version}` : ""}
                  {fillable ? ` · ${detail?.fields.length} questions` : ""}
                </p>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5 flex flex-col gap-4">
          {error ? (
            <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          ) : (
            <>
              {detail?.description && (
                <p className="text-sm text-gray-600 dark:text-muted-foreground">{detail.description}</p>
              )}

              {/* Link a matter first: everything it already knows becomes an
                  answer the advocate is not asked for. */}
              <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-4">
                <p className="text-sm font-semibold text-gray-900 dark:text-foreground">
                  Fill it from a matter you already have
                </p>
                <p className="text-xs text-gray-500 dark:text-muted-foreground mt-0.5">
                  Anything the case record or your documents already say is filled in for you, with the
                  source shown. Everything else is asked.
                </p>

                <div className="grid gap-3 sm:grid-cols-2 mt-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-muted-foreground">
                      <Library className="w-3.5 h-3.5" />
                      Corpus
                    </span>
                    <select
                      value={corpusId}
                      onChange={(e) => setCorpusId(e.target.value)}
                      className="h-9 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card px-2.5 text-sm text-gray-900 dark:text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <option value="">Not linked</option>
                      {corpora.map((c) => (
                        <option key={c.corpusId} value={c.corpusId}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-muted-foreground">
                      <Briefcase className="w-3.5 h-3.5" />
                      Case
                    </span>
                    <select
                      value={caseId}
                      onChange={(e) => setCaseId(e.target.value)}
                      className="h-9 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card px-2.5 text-sm text-gray-900 dark:text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <option value="">Not linked</option>
                      {cases.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  disabled={!fillable || starting !== null}
                  onClick={() => start("wizard")}
                  className={cn(
                    "text-left rounded-xl border p-4 transition-all",
                    fillable
                      ? "border-accent/40 bg-accent/5 hover:border-accent hover:shadow-sm"
                      : "border-gray-200 dark:border-border bg-white dark:bg-card opacity-50 cursor-not-allowed"
                  )}
                >
                  <ListChecks className="w-4 h-4 text-accent" />
                  <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-foreground">Fill it in</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-muted-foreground">
                    {fillable
                      ? "A few short questions, one at a time."
                      : "This form has no questions set up yet."}
                  </p>
                </button>

                <button
                  type="button"
                  disabled={starting !== null}
                  onClick={() => start("ai")}
                  className="text-left rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-4 hover:border-accent/40 hover:shadow-sm transition-all"
                >
                  <Sparkles className="w-4 h-4 text-accent" />
                  <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-foreground">
                    Draft with AI
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-muted-foreground">
                    Describe the matter and work through it in chat.
                  </p>
                </button>

                <button
                  type="button"
                  disabled={starting !== null}
                  onClick={() => start("blank")}
                  className="text-left rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-4 hover:border-accent/40 hover:shadow-sm transition-all"
                >
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                  <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-foreground">
                    Open a blank copy
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-muted-foreground">
                    Straight to the editor, nothing filled in.
                  </p>
                </button>
              </div>

              {starting && (
                <p className="flex items-center gap-2 text-xs text-gray-500 dark:text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Preparing your document...
                </p>
              )}

              <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-border">
                  <p className="text-xs font-semibold text-gray-700 dark:text-foreground">
                    The court&apos;s own form
                  </p>
                  {pdfUrl && (
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                    >
                      Open <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <div className="h-[420px] bg-gray-50 dark:bg-secondary/30">
                  {pdfUrl ? (
                    <iframe src={pdfUrl} title="The court's own form" className="w-full h-full" />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center gap-2 px-6 text-center">
                      <FileWarning className="w-6 h-6 text-gray-300 dark:text-gray-600" />
                      <p className="text-xs text-gray-500 dark:text-muted-foreground">
                        {pdfError || "This template was written by hand, so there is no court PDF behind it."}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-gray-500 dark:text-muted-foreground">
                This template is a reconstruction of a court document. Check the finished draft against
                the court&apos;s own form above before filing it.
              </p>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
