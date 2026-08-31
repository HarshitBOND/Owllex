"use client"

import { useCallback, useEffect, useState } from "react"
import type { CorpusSummary } from "../types"

export function useCorpora(enabled = true) {
  const [corpora, setCorpora] = useState<CorpusSummary[]>([])
  const [loading, setLoading] = useState(enabled)

  const refresh = useCallback(async () => {
    const res = await fetch("/api/corpus")
    if (!res.ok) {
      setLoading(false)
      return
    }
    const data = await res.json()
    setCorpora(data.corpora ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (enabled) refresh()
  }, [enabled, refresh])

  return { corpora, loading, refresh }
}
