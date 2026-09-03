"use client"

import { useEffect, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCredits } from "@/lib/ai/credits"
import { PanelHeader, Pill, RowGroup } from "./SettingsPrimitives"

type CreditWindow = {
  used: number
  cap: number
  remaining: number
  percent: number
  resetAt: string | null
}

type UsageData = {
  plan: string
  isActive: boolean
  windows: { window5h: CreditWindow; daily: CreditWindow; weekly: CreditWindow; monthly: CreditWindow }
  deepResearch: { used: number; limit: number }
}

const resetLabel = (iso: string | null) => {
  if (!iso) return null
  const date = new Date(iso)
  const sameDay = date.toDateString() === new Date().toDateString()
  return `Resets ${date.toLocaleString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    day: sameDay ? undefined : "numeric",
    month: sameDay ? undefined : "short",
  })}`
}

function UsageBar({
  label,
  sublabel,
  data,
}: {
  label: string
  sublabel?: string | null
  data: CreditWindow
}) {
  const tone =
    data.percent >= 90 ? "bg-red-500" : data.percent >= 70 ? "bg-amber-500" : "bg-accent"

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 py-4">
      <div className="sm:w-52 shrink-0">
        <p className="text-[13.5px] text-gray-800 dark:text-foreground">{label}</p>
        {sublabel ? (
          <p className="text-[12.5px] text-gray-500 dark:text-muted-foreground mt-0.5">{sublabel}</p>
        ) : null}
      </div>

      <div className="flex-1 min-w-0 flex items-center gap-4">
        <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-border overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-[width] duration-500", tone)}
            style={{ width: `${data.percent}%` }}
          />
        </div>
        <p className="text-[12.5px] text-gray-600 dark:text-muted-foreground whitespace-nowrap tabular-nums">
          {data.percent}% used
        </p>
      </div>
    </div>
  )
}

export function UsagePanel() {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch("/api/userdetails/ai-usage")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled) return
        if (payload?.success) setData(payload)
        else setError(true)
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false))

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <>
        <PanelHeader title="Usage" />
        <p className="mt-6 text-[13px] text-gray-500 dark:text-muted-foreground">
          Usage could not be loaded right now. Try again in a moment.
        </p>
      </>
    )
  }

  const { windows, deepResearch } = data

  return (
    <>
      <div className="flex items-center gap-2">
        <PanelHeader title="Plan usage limits" />
        <Pill tone={data.isActive ? "brand" : "warn"}>{data.plan}</Pill>
      </div>

      <RowGroup>
        <UsageBar
          label="Current session"
          sublabel={resetLabel(windows.window5h.resetAt) ?? "Starts when you send a message"}
          data={windows.window5h}
        />
        <UsageBar label="Today" sublabel={resetLabel(windows.daily.resetAt)} data={windows.daily} />
      </RowGroup>

      <RowGroup title="Longer limits">
        <UsageBar label="This week" sublabel={resetLabel(windows.weekly.resetAt)} data={windows.weekly} />
        <UsageBar label="This month" sublabel={resetLabel(windows.monthly.resetAt)} data={windows.monthly} />
      </RowGroup>

      <RowGroup title="Credits">
        <div className="py-4">
          <div className="flex items-baseline gap-2">
            <p className="text-[22px] font-semibold text-gray-900 dark:text-foreground tabular-nums">
              {formatCredits(windows.monthly.remaining)}
            </p>
            <p className="text-[13px] text-gray-500 dark:text-muted-foreground">credits left this month</p>
          </div>
          <p className="text-[12.5px] text-gray-500 dark:text-muted-foreground mt-1">
            {formatCredits(windows.monthly.used)} of {formatCredits(windows.monthly.cap)} used. Credits are spent
            per request — longer documents and deeper reasoning cost more.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] text-gray-800 dark:text-foreground">Deep Research runs</p>
              <p className="text-[12.5px] text-gray-500 dark:text-muted-foreground mt-0.5">
                Included with your plan each month.
              </p>
            </div>
          </div>
          <p className="text-[13px] text-gray-700 dark:text-foreground tabular-nums whitespace-nowrap">
            {deepResearch.used} / {deepResearch.limit}
          </p>
        </div>
      </RowGroup>
    </>
  )
}
