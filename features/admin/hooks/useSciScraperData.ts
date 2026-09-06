import { useCallback, useEffect, useState } from "react"
import type { SciScraperJob } from "../types"

const ACTIVE_STATUSES = new Set(["starting", "waiting_for_captcha", "downloading"])

export function useSciScraperData(onProgress?: () => void) {
  const [count, setCount] = useState(25)
  const [job, setJob] = useState<SciScraperJob | null>(null)
  const [running, setRunning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const fetchSciScraperStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sci-scraper")
      const data = await res.json()
      if (data.success) {
        setJob(data.job)
        setRunning(!!data.job && ACTIVE_STATUSES.has(data.job.status))
        // Each judgment lands in the knowledge base as it downloads, so pull
        // the latest document/chunk counts every time job progress ticks.
        onProgress?.()
      }
    } catch {
      // Ignore polling errors
    }
  }, [onProgress])

  useEffect(() => {
    if (!running) return
    const interval = setInterval(fetchSciScraperStatus, 2000)
    return () => clearInterval(interval)
  }, [running, fetchSciScraperStatus])

  const handleStartSciScraper = async () => {
    setFormError(null)
    setStarting(true)
    try {
      const res = await fetch("/api/admin/sci-scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      })
      const data = await res.json()
      if (data.success) {
        setJob(data.job)
        setRunning(true)
      } else {
        setFormError(data.error || "Failed to start scraper")
        if (data.job) setJob(data.job)
      }
    } catch {
      setFormError("Network error starting scraper")
    } finally {
      setStarting(false)
    }
  }

  const handleCancelSciScraper = async () => {
    try {
      const res = await fetch("/api/admin/sci-scraper", { method: "DELETE" })
      const data = await res.json()
      if (data.success) {
        setJob(data.job)
        setRunning(false)
      }
    } catch {
      // Ignore cancel errors
    }
  }

  return {
    count,
    setCount,
    job,
    running,
    starting,
    formError,
    fetchSciScraperStatus,
    handleStartSciScraper,
    handleCancelSciScraper,
  }
}
