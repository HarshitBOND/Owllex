"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, FileClock, FileText, Loader2, Plus } from "lucide-react"
import DocumentTemplatesLibrary from "@/features/draft-documents/components/DocumentTemplatesLibrary"

type DraftRow = {
  id: string
  title: string
  status: string
  templateTitle: string
  wordCount: number
  updatedAt: string
}

function relative(iso: string) {
  const then = new Date(iso).getTime()
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

/** The form library, inline, so choosing one never leaves this screen. */
export function DraftPanel() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-5">
      <div className="max-w-5xl mx-auto">
        <DocumentTemplatesLibrary />
      </div>
    </div>
  )
}

/** Documents already in progress, newest first. */
export function RevisionsPanel() {
  const router = useRouter()
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch("/api/draft-documents?limit=25")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.success) return
        setDrafts(data.drafts)
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-5">
      <div className="max-w-2xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-text-400" />
          </div>
        ) : drafts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-bg-300 py-16 flex flex-col items-center justify-center text-center gap-2 px-6">
            <FileClock className="w-8 h-8 text-text-400" />
            <p className="text-sm font-semibold text-text-100">Nothing in progress</p>
            <p className="text-xs text-text-400 max-w-sm">
              Documents you draft show up here so you can pick one up where you left it.
            </p>
            <button
              type="button"
              onClick={() => router.push("/draft-documents/new")}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-white bg-accent rounded-lg px-3 py-2 hover:opacity-90 transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" />
              Start a document
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-bg-300 overflow-hidden">
            {drafts.map((draft, i) => (
              <button
                key={draft.id}
                type="button"
                onClick={() => router.push(`/draft-documents/${draft.id}`)}
                className={[
                  "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg-200 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                  i !== drafts.length - 1 ? "border-b border-bg-300" : "",
                ].join(" ")}
              >
                <span className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-accent" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-text-100 truncate">{draft.title}</span>
                  <span className="block text-xs text-text-400 truncate">
                    {draft.templateTitle || "Blank document"} · {draft.wordCount} words ·{" "}
                    {relative(draft.updatedAt)}
                  </span>
                </span>
                {draft.status === "final" && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-400">Final</span>
                )}
                <ArrowRight className="w-3.5 h-3.5 text-text-400 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
