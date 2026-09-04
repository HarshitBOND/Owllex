"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, FileClock, Loader2, X } from "lucide-react"

type Changes = {
  fromVersion: number
  toVersion: number
  changeNote: string
  added: { key: string; label: string; required: boolean }[]
  removed: { key: string; label: string }[]
  retyped: { key: string; label: string; type: string }[]
  relabelled: { key: string; from: string; to: string }[]
  dropped: { key: string; label: string; reason: string }[]
}

/**
 * Tells the advocate a newer version of their form exists, and does nothing
 * else unless they ask.
 *
 * Never auto-migrates and never re-renders in place. A document part way
 * through being filed must not change under its author, so updating produces a
 * separate copy and leaves this one exactly as it is.
 */
export default function TemplateVersionBanner({
  draftId,
  pinnedVersion,
  latestVersion,
}: {
  draftId: string
  pinnedVersion: number
  latestVersion: number
}) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)
  const [changes, setChanges] = useState<Changes | null>(null)
  const [loading, setLoading] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [error, setError] = useState("")

  const viewChanges = useCallback(async () => {
    if (changes) {
      setChanges(null)
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/draft-documents/${draftId}/migrate`)
      const data = await res.json()
      if (data.success) setChanges(data)
      else setError(data.error || "Couldn't work out what changed.")
    } catch {
      setError("Couldn't reach the server.")
    } finally {
      setLoading(false)
    }
  }, [draftId, changes])

  const migrate = useCallback(async () => {
    setMigrating(true)
    setError("")
    try {
      const res = await fetch(`/api/draft-documents/${draftId}/migrate`, { method: "POST" })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || "Couldn't update this document.")
        return
      }
      router.push(`/draft-documents/${data.id}`)
    } catch {
      setError("Couldn't reach the server.")
    } finally {
      setMigrating(false)
    }
  }, [draftId, router])

  if (dismissed) return null

  const nothingChanged =
    changes &&
    changes.added.length === 0 &&
    changes.removed.length === 0 &&
    changes.retyped.length === 0 &&
    changes.relabelled.length === 0

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-500/25 bg-blue-50 dark:bg-blue-500/10 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex items-center gap-1.5 flex-1 min-w-[240px] text-[12.5px] text-blue-900 dark:text-blue-200">
          <FileClock className="w-4 h-4 shrink-0" />
          A newer version of this form is available (v{latestVersion}). This document stays on v
          {pinnedVersion} until you choose to update.
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={viewChanges}
            disabled={loading}
            aria-expanded={!!changes}
            className="h-7 px-3 rounded-lg border border-blue-300 dark:border-blue-500/30 text-[12px] font-medium text-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : changes ? "Hide changes" : "View changes"}
          </button>
          <button
            type="button"
            onClick={migrate}
            disabled={migrating}
            className="h-7 px-3 rounded-lg bg-blue-600 text-white text-[12px] font-medium hover:bg-blue-700 transition-colors inline-flex items-center gap-1 disabled:opacity-50"
          >
            {migrating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
            Update to latest
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="h-7 w-7 rounded-lg text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {error && <p className="mt-1.5 text-[12px] text-red-700 dark:text-red-400">{error}</p>}

      {changes && (
        <div className="mt-2.5 pt-2.5 border-t border-blue-200 dark:border-blue-500/20 space-y-1.5">
          {changes.changeNote && (
            <p className="text-[12px] text-blue-900 dark:text-blue-200 italic">
              &ldquo;{changes.changeNote}&rdquo;
            </p>
          )}

          {nothingChanged && (
            <p className="text-[12px] text-blue-800 dark:text-blue-300">
              The fields are the same in both versions &mdash; only the wording of the form changed.
            </p>
          )}

          {changes.added.length > 0 && (
            <p className="text-[12px] text-blue-800 dark:text-blue-300">
              <b>New questions:</b> {changes.added.map((f) => f.label).join(", ")}
            </p>
          )}
          {changes.removed.length > 0 && (
            <p className="text-[12px] text-blue-800 dark:text-blue-300">
              <b>No longer asked:</b> {changes.removed.map((f) => f.label).join(", ")}
            </p>
          )}
          {changes.retyped.length > 0 && (
            <p className="text-[12px] text-blue-800 dark:text-blue-300">
              <b>Answered differently now:</b>{" "}
              {changes.retyped.map((f) => `${f.label} (${f.type})`).join(", ")}
            </p>
          )}
          {changes.relabelled.length > 0 && (
            <p className="text-[12px] text-blue-800 dark:text-blue-300">
              <b>Reworded:</b>{" "}
              {changes.relabelled.map((f) => `"${f.from}" → "${f.to}"`).join(", ")}
            </p>
          )}

          {changes.dropped.length > 0 ? (
            <p className="text-[12px] text-amber-800 dark:text-amber-300">
              <b>Updating would lose:</b>{" "}
              {changes.dropped.map((d) => `${d.label} (${d.reason})`).join(", ")}
            </p>
          ) : (
            <p className="text-[12px] text-blue-800 dark:text-blue-300">
              All of your answers carry across.
            </p>
          )}

          <p className="text-[11px] text-blue-700 dark:text-blue-400">
            Updating creates a new copy. This document is left exactly as it is.
          </p>
        </div>
      )}
    </div>
  )
}
