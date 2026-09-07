"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { buildInlineRedline, buildRedline, closeOpenTags } from "@/lib/diff/htmlRedline"

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
  /**
   * Called with the finished document once a revision completes.
   *
   * `wasScoped` is true when the revision that just resolved was scoped to a
   * selection -- the caller uses it to skip re-opening the whole-document
   * "Show edits" view, which would otherwise undo the point of showing a
   * scoped revision in place rather than as a full-document swap.
   *
   * `version` is the document's true version after the server applied this
   * change. Every path here writes to the document server-side, so the
   * caller must adopt this rather than incrementing its own last-known
   * version -- that local count drifts the moment autosave saves something
   * in between, and feeding a guessed version back into the autosave hook is
   * exactly what produces a spurious "changed in another tab" conflict.
   */
  onApplied: (html: string, revisions: Revision[], wasScoped?: boolean, version?: number) => void
}

/**
 * How often the streaming redline is rebuilt.
 *
 * A word-chunked stream fires far faster than anyone can read, and buildRedline
 * walks both documents each time. Rebuilding on every chunk pegs the main
 * thread on a long contract; six frames a second still reads as live.
 */
const REDLINE_THROTTLE_MS = 150

/**
 * Above this many characters, a selection stops being treated as "scoped" for
 * display purposes -- even though the splice itself still targets exactly
 * what was selected.
 *
 * The in-place passage view anchors its approve/reject box at the end of the
 * selection; for a sentence or a paragraph that's always inside the visible
 * text, but a selection covering most of the document (a select-all before
 * revising, say) puts that box wherever the selection happens to end, often
 * off-screen with nothing else to reach it -- a dead end, since the document
 * itself also stays hidden behind a full-document redline until the pending
 * change is resolved one way or the other. Past this length it falls back to
 * exactly the whole-document treatment: the reliable top bar and a
 * full-document redline, as if nothing had been selected at all.
 */
const SCOPED_DISPLAY_LIMIT = 400

export function useRevisions(docId: string | null, endpointBase: string, options: UseRevisionsOptions) {
  const { currentHtml } = options

  const [revisions, setRevisions] = useState<Revision[]>([])
  const [pendingInstruction, setPendingInstruction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A revision the server has already saved but the advocate hasn't accepted
  // into the working document yet -- held here so the redline can be shown as
  // a proposal, not a fait accompli. Rejecting it reverts the very row it names.
  const [awaitingApproval, setAwaitingApproval] = useState<{
    revisionId: string
    beforeHtml: string
    afterHtml: string
    /** The model's raw answer, before it was spliced into the document -- just the passage, for a scoped revision. */
    afterFragment: string
    revisions: Revision[]
    /** The document's true version once this revision was saved server-side. */
    version?: number
  } | null>(null)

  /**
   * The passage this in-flight or awaiting-approval revision is scoped to, if
   * any -- frozen at submit time, unlike the live editor selection, so it
   * keeps pointing at the right spot even if the advocate clicks elsewhere
   * while the model is still writing.
   */
  const [scopedSelection, setScopedSelection] = useState<RevisionSelection | null>(null)

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
      if (!docId || !instruction.trim() || awaitingApproval) return

      const baseHtml = currentHtml
      const controller = new AbortController()
      abortRef.current = controller
      setPendingInstruction(instruction)
      setStreamBase(baseHtml)
      setStreamPartial("")
      setScopedSelection(selection && selection.text.length <= SCOPED_DISPLAY_LIMIT ? selection : null)
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
        setScopedSelection(null)
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
        setScopedSelection(null)
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
        setScopedSelection(null)
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
        setScopedSelection(null)
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
      const nextVersion: number | undefined = refreshed?.success
        ? (refreshed.review?.version ?? refreshed.draft?.version)
        : undefined

      const latest = nextRevisions[nextRevisions.length - 1]
      if (latest?.status === "error") {
        setScopedSelection(null)
        setError(latest.errorMessage)
        setRevisions(nextRevisions)
        return
      }

      setRevisions(nextRevisions)
      // The server has already saved this revision, but the working document
      // (and the editor showing it) is not moved until the advocate approves --
      // until then it's a proposal, shown only as a redline.
      if (!latest) setScopedSelection(null)
      setAwaitingApproval(
        latest
          ? {
              revisionId: latest.id,
              beforeHtml: latest.contentHtmlBefore || baseHtml,
              afterHtml: nextHtml,
              afterFragment: finalHtml,
              revisions: nextRevisions,
              version: nextVersion,
            }
          : null,
      )
    },
    [docId, endpointBase, currentHtml, revisions, awaitingApproval],
  )

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setPendingInstruction(null)
    setStreamPartial("")
    setScopedSelection(null)
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

    if (awaitingApproval) {
      return buildRedline(awaitingApproval.beforeHtml, awaitingApproval.afterHtml)
    }

    const latest = revisions[revisions.length - 1]
    if (!latest?.contentHtmlBefore) return ""
    return buildRedline(latest.contentHtmlBefore, currentHtml)
  }, [isGenerating, streamBase, streamPartial, revisions, currentHtml, awaitingApproval])

  /**
   * The same diff, scoped to just the passage a selection-scoped revision
   * targets -- what the in-document overlay shows instead of swapping the
   * whole editor for a full-document redline. Empty (and thus not shown)
   * whenever the current revision wasn't scoped to a selection at all.
   */
  const passageRedlineHtml = useMemo(() => {
    if (!scopedSelection) return ""
    const answer = isGenerating ? closeOpenTags(streamPartial) : (awaitingApproval?.afterFragment ?? "")
    if (!answer) return ""
    return buildInlineRedline(scopedSelection.text, answer)
  }, [scopedSelection, isGenerating, streamPartial, awaitingApproval])

  const revert = useCallback(
    async (revisionId: string) => {
      if (!docId || awaitingApproval) return
      setError(null)

      const res = await fetch(`${endpointBase}/${docId}/revisions/${revisionId}/revert`, { method: "POST" })
      const data = await res.json().catch(() => null)

      if (!data?.success) {
        setError(data?.error || "Couldn't revert that revision.")
        return
      }

      setRevisions(data.revisions)
      optionsRef.current.onApplied(data.contentHtml, data.revisions, undefined, data.version)
    },
    [docId, endpointBase, awaitingApproval],
  )

  /** Accepts the pending proposal into the working document. */
  const approve = useCallback(() => {
    if (!awaitingApproval) return
    optionsRef.current.onApplied(
      awaitingApproval.afterHtml,
      awaitingApproval.revisions,
      Boolean(scopedSelection),
      awaitingApproval.version,
    )
    setAwaitingApproval(null)
    setScopedSelection(null)
  }, [awaitingApproval, scopedSelection])

  /**
   * Discards the pending proposal.
   *
   * It was already saved server-side the moment it streamed in, so rejecting
   * it reuses the same revert-to-here plumbing "Revert" uses on older rows --
   * there is nothing special about the row being unapproved rather than old.
   */
  const reject = useCallback(async () => {
    if (!awaitingApproval || !docId) return
    const revisionId = awaitingApproval.revisionId
    const wasScoped = Boolean(scopedSelection)
    setAwaitingApproval(null)
    setScopedSelection(null)
    setError(null)

    const res = await fetch(`${endpointBase}/${docId}/revisions/${revisionId}/revert`, { method: "POST" })
    const data = await res.json().catch(() => null)

    if (!data?.success) {
      setError(data?.error || "Couldn't discard that revision.")
      return
    }

    setRevisions(data.revisions)
    optionsRef.current.onApplied(data.contentHtml, data.revisions, wasScoped, data.version)
  }, [awaitingApproval, docId, endpointBase, scopedSelection])

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
    /** The passage the current revision is scoped to, frozen at submit time; null for a whole-document revision. */
    scopedSelection,
    /** The scoped diff to show in place of that passage -- see passageRedlineHtml above. */
    passageRedlineHtml,
    /** The instruction text for the proposal awaiting approval, if any. */
    awaitingApprovalInstruction: awaitingApproval
      ? (revisions.find((r) => r.id === awaitingApproval.revisionId)?.instruction ?? null)
      : null,
    hasPendingApproval: awaitingApproval !== null,
    approve,
    reject,
  }
}
