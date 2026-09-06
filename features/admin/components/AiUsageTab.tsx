"use client"

import { useCallback, useEffect, useState } from "react"
import { RefreshCw, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Where the OpenAI money actually went.
 *
 * Every recorded model call has always been written to AiUsageEvent and nothing
 * ever read it, so a surprising bill could not be explained from inside the app.
 * The costs shown are the app's own reckoning at the rates in lib/ai/rates.ts,
 * not an invoice -- compare against the provider dashboard before trusting a
 * total.
 */

interface Row {
  costPaise: number
  calls: number
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
}

interface UsageResponse {
  days: number
  totals: Row & { cacheHitRatio: number }
  byFeature: (Row & { feature: string })[]
  byModel: (Row & { modelKey: string })[]
  byDay: (Row & { date: string })[]
  topUsers: { clerkUid: string; label: string; costPaise: number; calls: number }[]
}

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const compact = (n: number) => n.toLocaleString("en-IN")

const CARD =
  "bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm"

function Breakdown({
  title,
  rows,
  total,
}: {
  title: string
  rows: { key: string; costPaise: number; calls: number }[]
  total: number
}) {
  return (
    <div className={`${CARD} p-4`}>
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">Nothing recorded yet.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => {
            const share = total > 0 ? (row.costPaise / total) * 100 : 0
            return (
              <div key={row.key}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium truncate">{row.key}</span>
                  <span className="tabular-nums whitespace-nowrap text-gray-600 dark:text-gray-300">
                    {rupees(row.costPaise)}
                    <span className="text-gray-400 dark:text-gray-500"> · {compact(row.calls)} calls</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sidebar-primary"
                    style={{ width: `${Math.max(share, share > 0 ? 2 : 0)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function AiUsageTab() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<UsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/ai-usage?days=${days}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "Could not load AI usage.")
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load AI usage.")
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    void load()
  }, [load])

  const totals = data?.totals
  // The share of input billed at the cached rate, which is a tenth of the
  // normal one. A route that puts changing state in its system prompt sits near
  // zero here, so this is the number that catches a caching regression.
  const cachePct = totals ? Math.round(totals.cacheHitRatio * 100) : 0
  const peakDay = data?.byDay.reduce<UsageResponse["byDay"][number] | null>(
    (best, row) => (!best || row.costPaise > best.costPaise ? row : best),
    null
  )

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800"
          >
            <option value={1}>Last 24 hours</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <Button size="sm" onClick={() => void load()} className="gap-1.5" disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Estimated from recorded token counts at the configured rates, not a provider invoice.
          Events are kept for 90 days.
        </p>
      </div>

      {error && (
        <div className={`${CARD} p-4 border-red-300 dark:border-red-800`}>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {totals && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className={`${CARD} p-4`}>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total spend</p>
              <p className="text-2xl font-semibold tabular-nums mt-1">{rupees(totals.costPaise)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {compact(totals.calls)} model calls
              </p>
            </div>
            <div className={`${CARD} p-4`}>
              <p className="text-xs text-gray-500 dark:text-gray-400">Output tokens</p>
              <p className="text-2xl font-semibold tabular-nums mt-1">{compact(totals.outputTokens)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Billed at roughly 8x the input rate
              </p>
            </div>
            <div className={`${CARD} p-4`}>
              <p className="text-xs text-gray-500 dark:text-gray-400">Input served from cache</p>
              <p className="text-2xl font-semibold tabular-nums mt-1">{cachePct}%</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {compact(totals.cachedInputTokens)} of {compact(totals.inputTokens)} input tokens
              </p>
            </div>
            <div className={`${CARD} p-4`}>
              <p className="text-xs text-gray-500 dark:text-gray-400">Most expensive day</p>
              <p className="text-2xl font-semibold tabular-nums mt-1">
                {peakDay ? rupees(peakDay.costPaise) : "-"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {peakDay ? peakDay.date : "Nothing recorded yet"}
              </p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Breakdown
              title="By feature"
              total={totals.costPaise}
              rows={data.byFeature.map((r) => ({ key: r.feature, costPaise: r.costPaise, calls: r.calls }))}
            />
            <Breakdown
              title="By model"
              total={totals.costPaise}
              rows={data.byModel.map((r) => ({ key: r.modelKey, costPaise: r.costPaise, calls: r.calls }))}
            />
          </div>

          <div className={`${CARD} p-4`}>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <TrendingUp size={14} /> Daily spend
            </h3>
            {data.byDay.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">Nothing recorded yet.</p>
            ) : (
              <div className="flex items-end gap-1 h-32 overflow-x-auto">
                {data.byDay.map((row) => {
                  const peak = peakDay?.costPaise || 1
                  return (
                    <div
                      key={row.date}
                      className="flex-1 min-w-[6px] bg-sidebar-primary/80 hover:bg-sidebar-primary rounded-t transition-colors"
                      style={{ height: `${Math.max((row.costPaise / peak) * 100, 2)}%` }}
                      title={`${row.date}: ${rupees(row.costPaise)} over ${compact(row.calls)} calls`}
                    />
                  )
                })}
              </div>
            )}
          </div>

          <div className={`${CARD} overflow-hidden`}>
            <h3 className="text-sm font-semibold p-4 pb-3">Highest spend by user</h3>
            {data.topUsers.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 px-4 pb-4">Nothing recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">User</th>
                    <th className="text-right font-medium px-4 py-2">Calls</th>
                    <th className="text-right font-medium px-4 py-2">Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topUsers.map((user) => (
                    <tr key={user.clerkUid} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-2 truncate max-w-[280px]">{user.label}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{compact(user.calls)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{rupees(user.costPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
