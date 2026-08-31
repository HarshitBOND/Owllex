"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict"

export type DraftPatch = {
  title?: string
  contentHtml?: string
  status?: "draft" | "final"
  typography?: { fontFamily: string; fontSizePt: number }
  wordCount?: number
}

const DEBOUNCE_MS = 1200
const HEARTBEAT_MS = 15000

export function useDraftAutosave(draftId: string, initialVersion: number, endpointBase = "/api/draft-documents") {
  const [status, setStatus] = useState<SaveStatus>("idle")
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)

  const versionRef = useRef(initialVersion)
  const pendingRef = useRef<DraftPatch | null>(null)
  const inFlightRef = useRef(false)
  const conflictRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    versionRef.current = initialVersion
  }, [initialVersion])

  const send = useCallback(async () => {
    if (inFlightRef.current || conflictRef.current) return
    const patch = pendingRef.current
    if (!patch) return

    pendingRef.current = null
    inFlightRef.current = true
    setStatus("saving")

    let saved = false
    try {
      const res = await fetch(`${endpointBase}/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, version: versionRef.current }),
      })
      const data = await res.json()

      if (res.status === 409) {
        conflictRef.current = true
        inFlightRef.current = false
        setStatus("conflict")
        return
      }
      if (data.success) {
        versionRef.current = data.version
        setLastSavedAt(new Date())
        saved = true
      }
    } catch {
      // Network failure — the patch goes back on the queue below.
    }

    inFlightRef.current = false

    if (!saved) {
      // Anything queued while this was in flight is newer, so it wins.
      pendingRef.current = { ...patch, ...(pendingRef.current || {}) }
      setStatus("error")
      return
    }

    if (pendingRef.current) send()
    else setStatus("saved")
  }, [draftId, endpointBase])

  const queue = useCallback(
    (patch: DraftPatch) => {
      if (conflictRef.current) return
      pendingRef.current = { ...(pendingRef.current || {}), ...patch }
      setStatus("saving")
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(send, DEBOUNCE_MS)
    },
    [send]
  )

  const flush = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    while (inFlightRef.current) await new Promise((r) => setTimeout(r, 50))
    await send()
  }, [send])

  // Catches the continuous typist (whose debounce never fires) and retries errors.
  useEffect(() => {
    const id = setInterval(() => {
      if (pendingRef.current && !inFlightRef.current && !conflictRef.current) send()
    }, HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [send])

  useEffect(() => {
    const onHide = () => {
      const patch = pendingRef.current
      if (!patch || conflictRef.current) return
      fetch(`${endpointBase}/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, version: versionRef.current }),
        keepalive: true,
      })
    }
    window.addEventListener("pagehide", onHide)
    return () => {
      window.removeEventListener("pagehide", onHide)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      onHide()
    }
  }, [draftId, endpointBase])

  return { status, lastSavedAt, conflict: status === "conflict", queue, flush, retry: send }
}
