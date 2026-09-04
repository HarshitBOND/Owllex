"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, CopyCheck, FileText, Loader2, ScrollText } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { DiffLine } from "@/lib/templates/similarity"

type Candidate = {
  id: string
  title: string
  description: string
  category: string
  version: number
  publishedAt: string | null
  textSimilarity: number
  fieldsShared: number
  fieldsTotal: number
  fieldsOnlyInImport: string[]
  fieldsOnlyInExisting: string[]
  verdict: "duplicate" | "newer-version" | "different-form" | null
  confidence: number | null
  reason: string
  diff: DiffLine[]
}

const VERDICT_COPY: Record<string, { label: string; tone: string; blurb: string }> = {
  duplicate: {
    label: "Looks like a duplicate",
    tone: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
    blurb: "The same form, with nothing material changed.",
  },
  "newer-version": {
    label: "Looks like a newer version",
    tone: "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
    blurb: "Recognisably the same form, but the wording or fields have changed.",
  },
  "different-form": {
    label: "Looks like a different form",
    tone: "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
    blurb: "Shares boilerplate, but serves a different purpose.",
  },
}

function DiffView({ diff }: { diff: DiffLine[] }) {
  const changed = diff.filter((l) => l.type !== "same").length

  if (changed === 0) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400 px-3 py-2">
        The two bodies read identically once tags and blanks are set aside.
      </p>
    )
  }

  return (
    <div className="max-h-[280px] overflow-y-auto overflow-x-auto font-mono text-[11px] leading-relaxed">
      {diff.map((line, i) => (
        <div
          key={i}
          className={cn(
            "px-3 py-0.5 whitespace-pre-wrap",
            line.type === "add" && "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300",
            line.type === "remove" && "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300",
            line.type === "same" && "text-gray-500 dark:text-gray-500"
          )}
        >
          <span className="select-none opacity-60 mr-2">
            {line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}
          </span>
          {line.text}
        </div>
      ))}
    </div>
  )
}

/**
 * Shows the admin what the import collided with, and lets them decide.
 *
 * The comparison is the point: the scores and the model's one-line reason are
 * there to direct attention, not to make the call. Nothing is removed without
 * someone reading both forms.
 */
export function DuplicateReviewPanel({
  open,
  templateId,
  templateTitle,
  onClose,
  onResolved,
}: {
  open: boolean
  templateId: string | null
  templateTitle: string
  onClose: () => void
  onResolved: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [verdictError, setVerdictError] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [showDiff, setShowDiff] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !templateId) return
    let cancelled = false
    setLoading(true)
    setError("")
    fetch("/api/admin/document-templates/dedupe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (!data.success) {
          setError(data.error || "The comparison could not be run.")
          return
        }
        setCandidates(data.candidates || [])
        setVerdictError(data.verdictError ?? null)
      })
      .catch(() => !cancelled && setError("Could not reach the server."))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [open, templateId])

  const resolve = useCallback(
    async (action: "discard" | "supersede" | "keep", targetId?: string) => {
      if (!templateId) return
      setBusy(true)
      try {
        const res = await fetch("/api/admin/document-templates/dedupe/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ importId: templateId, action, targetId }),
        })
        const data = await res.json()
        if (!data.success) {
          toast.error(data.error || "Could not apply that.")
          return
        }
        toast.success(data.message)
        onResolved()
        onClose()
      } catch {
        toast.error("Could not reach the server.")
      } finally {
        setBusy(false)
      }
    },
    [templateId, onResolved, onClose]
  )

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Is this form already in the library?</DialogTitle>
          <DialogDescription>
            &ldquo;{templateTitle}&rdquo; looks close to what&apos;s below. Check it yourself before
            deciding &mdash; nothing is removed until you say so.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            <p className="text-xs text-gray-500 dark:text-gray-400">Comparing against published forms...</p>
          </div>
        ) : error ? (
          <div className="rounded-lg border-2 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        ) : candidates.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center gap-2 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Nothing else in the library looks like this
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
              This form doesn&apos;t match anything already published. Review it against its original,
              then publish it as usual.
            </p>
            <Button size="sm" className="mt-2" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {verdictError && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-500" />
                <p className="text-xs text-amber-800 dark:text-amber-300">{verdictError}</p>
              </div>
            )}

            {candidates.map((candidate) => {
              const copy = candidate.verdict ? VERDICT_COPY[candidate.verdict] : null
              return (
                <div
                  key={candidate.id}
                  className="rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden"
                >
                  <div className="px-4 py-3 bg-gray-50/70 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex flex-wrap items-center gap-2">
                      {copy ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
                            copy.tone
                          )}
                        >
                          <CopyCheck size={12} />
                          {copy.label}
                          {candidate.confidence !== null && ` · ${candidate.confidence}%`}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                          Similar form
                        </span>
                      )}
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {candidate.textSimilarity}% of the wording matches ·{" "}
                        {candidate.fieldsShared} of {candidate.fieldsTotal} field keys shared
                      </span>
                    </div>

                    {candidate.reason && (
                      <p className="mt-1.5 text-xs text-gray-700 dark:text-gray-300">{candidate.reason}</p>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 dark:divide-gray-800">
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400">
                        New import
                      </p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {templateTitle}
                      </p>
                      {candidate.fieldsOnlyInImport.length > 0 && (
                        <p className="mt-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
                          Only here: {candidate.fieldsOnlyInImport.join(", ")}
                        </p>
                      )}
                    </div>

                    <div className="px-4 py-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400">
                        Already published
                      </p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {candidate.title}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                        Version {candidate.version}
                        {candidate.publishedAt &&
                          ` · published ${new Date(candidate.publishedAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}`}
                      </p>
                      {candidate.fieldsOnlyInExisting.length > 0 && (
                        <p className="mt-1.5 text-[11px] text-red-700 dark:text-red-400">
                          Only there: {candidate.fieldsOnlyInExisting.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-800">
                    <button
                      type="button"
                      onClick={() => setShowDiff(showDiff === candidate.id ? null : candidate.id)}
                      aria-expanded={showDiff === candidate.id}
                      className="w-full flex items-center gap-1.5 px-4 py-2 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                    >
                      <ScrollText size={13} />
                      {showDiff === candidate.id ? "Hide" : "Show"} what differs
                    </button>
                    {showDiff === candidate.id && (
                      <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/40">
                        <DiffView diff={candidate.diff} />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => resolve("discard")}
                      className="text-red-600 hover:text-red-700"
                    >
                      Discard the import
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => resolve("supersede", candidate.id)}
                      title={`Publish this import as the next version of "${candidate.title}"`}
                    >
                      Replace &ldquo;{candidate.title}&rdquo;
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => resolve("keep")}>
                      Keep both
                    </Button>
                  </div>
                </div>
              )
            })}

            <div className="flex items-start gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
              <FileText size={13} className="mt-0.5 shrink-0 text-gray-400" />
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Replacing keeps the published form&apos;s identity and adds your import as its next
                version. Documents already drafted from it stay on the version they were started on and
                are offered the update.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
