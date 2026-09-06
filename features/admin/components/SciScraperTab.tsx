"use client"

import { CheckCircle2, Database, Gavel, Loader2, Play, RefreshCw, Square, Terminal, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { RagStatus, SciScraperJob } from "../types"

interface SciScraperTabProps {
  count: number
  setCount: (value: number) => void
  job: SciScraperJob | null
  running: boolean
  starting: boolean
  formError: string | null
  onStart: () => void
  onCancel: () => void
  kbStatus: RagStatus | null
  kbStatusLoading: boolean
  kbStatusError: string | null
  onRefreshKb: () => void
}

function statusLabel(status: SciScraperJob["status"]) {
  switch (status) {
    case "starting":
      return "Opening browser..."
    case "waiting_for_captcha":
      return "Waiting for you to solve the captcha"
    case "downloading":
      return "Downloading judgments..."
    case "completed":
      return "Completed"
    case "failed":
      return "Failed"
  }
}

export function SciScraperTab({
  count,
  setCount,
  job,
  running,
  starting,
  formError,
  onStart,
  onCancel,
  kbStatus,
  kbStatusLoading,
  kbStatusError,
  onRefreshKb,
}: SciScraperTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Gavel size={18} className="text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-300">
            <p className="font-semibold">How this works</p>
            <p className="mt-1 text-blue-700 dark:text-blue-400">
              Starting a run opens a real Chromium window on the server running this app.
              Solve the captcha and run a search in that window — the scraper picks up
              automatically once results appear and downloads judgment PDFs from there.
              Each judgment is then chunked, embedded, and added to the knowledge base
              right away, so the counts below reflect what's actually searchable in the app.
              This only works when you can see that browser window (i.e. running locally).
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Database size={16} className="text-gray-600" />
            Knowledge Base
          </h3>
          <Button onClick={onRefreshKb} variant="outline" size="sm" className="gap-1.5" disabled={kbStatusLoading}>
            <RefreshCw size={13} className={cn(kbStatusLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
        {kbStatusError ? (
          <p className="text-sm text-red-600">{kbStatusError}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {kbStatus ? kbStatus.document_count.toLocaleString() : "—"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total documents available</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {kbStatus ? kbStatus.chunk_count.toLocaleString() : "—"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Indexed chunks</p>
            </div>
            <div>
              <p
                className={cn(
                  "text-2xl font-bold",
                  kbStatus?.ready ? "text-brand-600" : "text-amber-600"
                )}
              >
                {kbStatus ? (kbStatus.ready ? "Ready" : "Not ready") : "—"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Pipeline status</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Run Controls</h3>
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="space-y-1.5">
            <label htmlFor="sci-count" className="text-sm text-gray-700 dark:text-gray-300">
              Number of judgments to download
            </label>
            <input
              id="sci-count"
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              disabled={running}
              className="w-40 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="md:ml-auto flex gap-2">
            {running && (
              <Button onClick={onCancel} variant="outline" className="gap-2" size="lg">
                <Square size={16} />
                Cancel
              </Button>
            )}
            <Button onClick={onStart} disabled={running || starting} className="gap-2" size="lg">
              {starting || running ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {running ? "Running..." : "Starting..."}
                </>
              ) : (
                <>
                  <Play size={16} />
                  Continue
                </>
              )}
            </Button>
          </div>
        </div>
        {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
      </div>

      {job && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal size={15} className="text-gray-600" />
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Progress Log</h3>
            </div>
            <div
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium",
                job.status === "completed"
                  ? "text-brand-600"
                  : job.status === "failed"
                    ? "text-red-600"
                    : "text-amber-600"
              )}
            >
              {job.status === "completed" ? (
                <CheckCircle2 size={12} />
              ) : job.status === "failed" ? (
                <XCircle size={12} />
              ) : (
                <Loader2 size={12} className="animate-spin" />
              )}
              {statusLabel(job.status)}
            </div>
          </div>
          <div className="p-4 max-h-[400px] overflow-y-auto bg-gray-50 dark:bg-gray-950 font-mono text-xs space-y-1">
            {job.log.length === 0 ? (
              <p className="text-gray-500">Waiting for output...</p>
            ) : (
              job.log.map((line, i) => (
                <p key={i} className="py-0.5 text-gray-700 dark:text-gray-300">
                  {line}
                </p>
              ))
            )}
          </div>
          <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">
              {job.downloaded}/{job.requested} downloaded · {job.ingested} added to knowledge base
            </span>
            {job.error && <span className="text-red-600">{job.error}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
