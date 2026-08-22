import { useCallback, useEffect, useState } from "react"
import type { CauselistProgressEntry, CauselistStatus, CauselistSummary } from "../types"

export function useCauselistImport() {
  const [clStatus, setClStatus] = useState<CauselistStatus | null>(null)
  const [clImportId, setClImportId] = useState<string | null>(null)
  const [clRunning, setClRunning] = useState(false)
  const [clProgress, setClProgress] = useState<CauselistProgressEntry[]>([])
  const [clSummary, setClSummary] = useState<CauselistSummary | null>(null)
  const [clAutoDelete, setClAutoDelete] = useState(true)
  const [clDaysBack, setClDaysBack] = useState(3)
  const [clFromCheckpoint, setClFromCheckpoint] = useState(true)
  const [clBackendError, setClBackendError] = useState<string | null>(null)

  const fetchCauselistStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/scraper/causelist-status")
      const data = await res.json()
      if (data.success) {
        setClBackendError(null)
        setClStatus(data)
        if (data.current_session) {
          setClImportId(data.current_session.import_id)
          setClRunning(true)
        }
      } else if (data.error?.includes("Python backend")) {
        setClBackendError(data.error)
      }
    } catch (err) {
      console.error("Causelist status fetch error:", err)
    }
  }, [])

  useEffect(() => {
    if (!clRunning || !clImportId) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/scraper/progress/${clImportId}`)
        const data = await res.json()
        if (data.success) {
          setClProgress(data.log || [])
          if (data.status === "completed" || data.status === "failed") {
            setClRunning(false)
            setClSummary(data.summary)
            fetchCauselistStatus()
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clRunning, clImportId])

  const handleStartCauselistImport = async () => {
    setClRunning(true)
    setClProgress([])
    setClSummary(null)
    setClBackendError(null)
    try {
      const res = await fetch("/api/scraper/parse-causelist-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days_back: clDaysBack,
          auto_delete_pdfs: clAutoDelete,
          start_from_checkpoint: clFromCheckpoint,
        }),
      })
      const data = await res.json()
      if (data.success && data.import_id) {
        setClImportId(data.import_id)
      } else {
        setClRunning(false)
        if (data.error?.includes("Python backend")) {
          setClBackendError(data.error)
        } else {
          alert(data.error || "Failed to start import")
        }
      }
    } catch {
      setClRunning(false)
      alert("Network error starting import")
    }
  }

  return {
    clStatus,
    clRunning,
    clProgress,
    clSummary,
    clAutoDelete,
    setClAutoDelete,
    clDaysBack,
    setClDaysBack,
    clFromCheckpoint,
    setClFromCheckpoint,
    clBackendError,
    setClBackendError,
    fetchCauselistStatus,
    handleStartCauselistImport,
  }
}
