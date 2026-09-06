"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Lock } from "lucide-react"

// Mirrors the shape returned by GET /api/userdetails/subscription (see
// app/api/lib/services/subscription.ts::SubscriptionSummary) — only the fields this gate needs.
type SubscriptionGateState = {
  isTrialExpired: boolean
  isPaidPlan: boolean
}

// Renders wherever <Sidebar /> mounts (every authenticated page), so it blocks the whole
// app once a trial-plan user's 7-day trial has ended. The route guard (requireUserContext)
// is the real enforcement — this is just the UI so users see a clear paywall instead of
// a wall of failed API requests.
export function TrialPaywallGate() {
  const router = useRouter()
  const [state, setState] = useState<SubscriptionGateState | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch("/api/userdetails/subscription")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.subscription) return
        setState({
          isTrialExpired: Boolean(data.subscription.isTrialExpired),
          isPaidPlan: Boolean(data.subscription.isPaidPlan),
        })
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  if (!state || state.isPaidPlan || !state.isTrialExpired) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-white dark:bg-gray-950 p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
          <Lock className="h-6 w-6 text-amber-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-foreground">
          Your 7-day free trial has ended
        </h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-muted-foreground">
          Upgrade to a paid plan to keep using Owllex — your cases and data are safe and waiting for you.
        </p>
        <button
          onClick={() => router.push("/pricing")}
          className="mt-5 w-full rounded-lg bg-sidebar-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
        >
          View plans &amp; upgrade
        </button>
      </div>
    </div>
  )
}
