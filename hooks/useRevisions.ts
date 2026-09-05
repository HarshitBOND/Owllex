"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { buildRedline, closeOpenTags } from "@/lib/diff/htmlRedline"

/**
 * The revision timeline for one document, shared by contract review and draft
 * documents.
 *
 * Parameterised by endpoint the same way useDraftAutosave is -- the two
 * features hold the same document shape, and the alternative was two copies of
 * the streaming and cancellation logic drifting apart.
 */

export type RevisionStatus = "pending" | "done" | "cancelled" | "error"

export interface Revision {
  id: string
  instruction: string
  status: RevisionStatus
  errorMessage: string
  scope: { selectedText: string; from: number; to: number }
  /** Empty once trimmed past the server's cap -- the row can no longer be reverted to. */
  contentHtmlBefore: string
  modelKey: string
  createdAt: string
}

export interface RevisionSelection {
  from: number
  to: number
  text: string
}

interface UseRevisionsOptions {
  /** Live editor HTML. Doubles as the diff base when a revision is submitted. */
  currentHtml: string
  /** Called with the finished document once a revision completes. */
  onApplied: (html: string, revisions: Revision[]) => void
}

/**
 * How often the streaming redline is rebuilt.
 *
 * A word-chunked stream fires far faster than anyone can read, and buildRedline
 * walks both documents each time. Rebuilding on every chunk pegs the main
 * thread on a long contract; six frames a second still reads as live.
 */
const REDLINE_THROTTLE_MS = 150

export function useRevisions(docId: string | null, endpointBase: string, options: UseRevisionsOptions) {
  const { currentHtml } = options

  const [revisions, setRevisions] = useState<Revision[]>([])
  const [pendingInstruction, setPendingInstruction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Base document and latest partial for the in-flight revision, kept in state
  // so the redline re-renders as the stream arrives.
  const [streamBase, setStreamBase] = useState("")
  const [streamPartial, setStreamPartial] = useState("")

  const abortRef = useRef<AbortController | null>(null)
  const lastRedlineAtRef = useRef(0)
  // Read inside the stream loop, which is created once per revision and would
  // otherwise close over the callbacks as they were at submit time.
  const optionsRef = useRef(options)
  optionsRef.current = options

  const isGenerating = pendingInstruction !== null

  const addRevision = useCallback(
    async (instruction: string, selection?: RevisionSelection | null, model?: string) => {
      if (!docId || !instruction.trim()) return

      const baseHtml = currentHtml
      const controller = new AbortController()
      abortRef.current = controller
      setPendingInstruction(instruction)
      setStreamBase(baseHtml)
      setStreamPartial("")
      setError(null)

      let res: Response
      try {
        res = await fetch(`${endpointBase}/${docId}/revise`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction, selection: selection ?? null, model }),
          signal: controller.signal,
        })
      } catch (err) {
        abortRef.current = null
        setPendingInstruction(null)
        // Cancelling is a deliberate act, not a failure to report.
        if (!(err instanceof Error && err.name === "AbortError")) {
          setError("Couldn't reach the server. Check your connection and try again.")
        }
        return
      }

      // The route answers with JSON only when it refuses; a success is the
      // stream itself, which has no envelope to check.
      if (!res.ok || !res.body) {
        abortRef.current = null
        setPendingInstruction(null)
        const message = await res
          .json()
          .then((data: { error?: string }) => data.error)
          .catch(() => null)
        setError(message || `The revision failed (HTTP ${res.status}).`)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let streamed = ""

      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          streamed += decoder.decode(value, { stream: true })

          const now = Date.now()
          if (now - lastRedlineAtRef.current >= REDLINE_THROTTLE_MS) {
            lastRedlineAtRef.current = now
            setStreamPartial(streamed)
          }
        }
      } catch (err) {
        abortRef.current = null
        setPendingInstruction(null)
        if (!(err instanceof Error && err.name === "AbortError")) {
          setError("The revision stopped part way through. Nothing was changed.")
        }
        return
      }

      abortRef.current = null
      setPendingInstruction(null)
      setStreamPartial("")

      const finalHtml = streamed.trim()
      if (!finalHtml) {
        setError("The model returned an empty revision. Try rewording the instruction.")
        return
      }

      // The row the server persisted is the source of truth for the timeline --
      // it carries the id, the trim state and any error the splice hit.
      const refreshed = await fetch(`${endpointBase}/${docId}`)
        .then((r) => r.json())
        .catch(() => null)

      const nextRevisions: Revision[] = refreshed?.success
        ? (refreshed.review?.revisions ?? refreshed.draft?.revisions ?? [])
        : revisions
      const nextHtml: string = refreshed?.success
        ? (refreshed.review?.contentHtml ?? refreshed.draft?.contentHtml ?? finalHtml)
        : finalHtml

      const failed = nextRevisions[nextRevisions.length - 1]
      if (failed?.status === "error") {
        setError(failed.errorMessage)
        setRevisions(nextRevisions)
        return
      }

      setRevisions(nextRevisions)
      optionsRef.current.onApplied(nextHtml, nextRevisions)
    },
    [docId, endpointBase, currentHtml, revisions],
  )

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setPendingInstruction(null)
    setStreamPartial("")
  }, [])

  /**
   * The tracked-changes diff to display.
   *
   * Mid-stream it is the partial against the document as it stood when the
   * revision was submitted; once settled it is the last revision's restore
   * point against the document now. Derived rather than stored, so toggling
   * "Show edits" never has to wait on anything.
   */
  const redlineHtml = useMemo(() => {
    if (isGenerating) {
      if (!streamPartial) return ""
      return buildRedline(streamBase, closeOpenTags(streamPartial))
    }

    const latest = revisions[revisions.length - 1]
    if (!latest?.contentHtmlBefore) return ""
    return buildRedline(latest.contentHtmlBefore, currentHtml)
  }, [isGenerating, streamBase, streamPartial, revisions, currentHtml])

  const revert = useCallback(
    async (revisionId: string) => {
      if (!docId) return
      setError(null)

      const res = await fetch(`${endpointBase}/${docId}/revisions/${revisionId}/revert`, { method: "POST" })
      const data = await res.json().catch(() => null)

      if (!data?.success) {
        setError(data?.error || "Couldn't revert that revision.")
        return
      }

      setRevisions(data.revisions)
      optionsRef.current.onApplied(data.contentHtml, data.revisions)
    },
    [docId, endpointBase],
  )

  return {
    revisions,
    setRevisions,
    pendingInstruction,
    isGenerating,
    error,
    clearError: useCallback(() => setError(null), []),
    addRevision,
    cancel,
    revert,
    redlineHtml,
  }
}
