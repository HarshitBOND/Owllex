import { useEffect, useState } from "react"
import type { DashboardData } from "../types"

export function useDashboardData(isSignedIn: boolean | undefined) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isSignedIn) {
      fetch("/api/userdetails/dashboard")
        .then((res) => res.json())
        .then((d) => { setData(d); setLoading(false) })
        .catch(() => setLoading(false))
    }
  }, [isSignedIn])

  return { data, loading }
}
