"use client"

import { useEffect, useState } from "react"

type WindowUsage = { usedPaise: number; capPaise: number; percent: number; resetAt: string | null }

type UsageData = {
  plan: string
  windows: { window5h: WindowUsage; daily: WindowUsage; weekly: WindowUsage; monthly: WindowUsage }
  deepResearch: { used: number; limit: number }
}

const rupees = (paise: number) => `₹${(paise / 100).toFixed(paise % 100 === 0 ? 0 : 2)}`

const resetLabel = (iso: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  const sameDay = d.getDate() === new Date().getDate()
  return d.toLocaleString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    day: sameDay ? undefined : "numeric",
    month: sameDay ? undefined : "short",
  })
}

function Bar({ label, w }: { label: string; w: WindowUsage }) {
  const color = w.percent >= 90 ? "bg-red-500" : w.percent >= 70 ? "bg-amber-500" : "bg-accent"
  return (
    <div className="p-3 rounded-lg border dark:border-border bg-gray-50 dark:bg-muted">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs text-gray-500 dark:text-muted-foreground">{label}</p>
        <p className="text-[11px] text-gray-500 dark:text-muted-foreground">
          {rupees(w.usedPaise)} / {rupees(w.capPaise)}
        </p>
      </div>
      <div className="h-1.5 rounded-full bg-gray-200 dark:bg-border overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${w.percent}%` }} />
      </div>
      {w.resetAt && (
        <p className="text-[11px] text-gray-400 dark:text-muted-foreground mt-1.5">Resets {resetLabel(w.resetAt)}</p>
      )}
    </div>
  )
}

export function AiUsageMeter() {
  const [data, setData] = useState<UsageData | null>(null)

  useEffect(() => {
    fetch("/api/userdetails/ai-usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.success) setData(d)
      })
      .catch(() => {})
  }, [])

  if (!data) return null

  return (
    <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-border shadow-sm mb-6">
      <div className="p-4 border-b border-gray-100 dark:border-border flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground">AI Usage</h3>
          <p className="text-sm text-muted-foreground">How much of your AI allowance you've used</p>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-muted-foreground">
          Deep Research: {data.deepResearch.used} / {data.deepResearch.limit} runs this month
        </p>
      </div>
      <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
        <Bar label="5-hour window" w={data.windows.window5h} />
        <Bar label="Today" w={data.windows.daily} />
        <Bar label="This week" w={data.windows.weekly} />
        <Bar label="This month" w={data.windows.monthly} />
      </div>
    </div>
  )
}
