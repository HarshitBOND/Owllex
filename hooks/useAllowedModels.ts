"use client"

import { useEffect, useState } from "react"

export function useAllowedModels() {
  const [allowedModels, setAllowedModels] = useState<string[] | undefined>(undefined)

  useEffect(() => {
    fetch("/api/userdetails/ai-usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.allowedModels)) setAllowedModels(d.allowedModels)
      })
      .catch(() => {})
  }, [])

  return allowedModels
}
