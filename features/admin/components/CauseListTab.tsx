"use client"

import { useEffect, useState } from "react"
import { Activity, CheckCircle2, Clock, FileSearch, Loader2, Play, Terminal, Trash2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { CauselistProgressEntry, CauselistStatus, CauselistSummary } from "../types"
import { formatDateTime, statusBadge } from "../utils"

interface CauseListTabProps {
  clStatus: CauselistStatus | null
  clRunning: boolean
  clProgress: CauselistProgressEntry[]
  clSummary: CauselistSummary | null
  clAutoDelete: boolean
  setClAutoDelete: (value: boolean) => void
  clDaysBack: number
  setClDaysBack: (value: number) => void
  clFromCheckpoint: boolean
  setClFromCheckpoint: (value: boolean) => void
  clBackendError: string | null
  onRetryConnection: () => void
  onStartImport: () => void
}

function progressIcon(status?: string) {
  if (status === "completed") return "✅"
  if (status === "error") return "❌"
  if (status === "cleaning") return "🗑️"
  if (status === "parsing") return "📄"
  if (status === "downloading") return "⬇️"
  return "→"
}

export function CauseListTab({
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
  onRetryConnection,
  onStartImport,
}: CauseListTabProps) {
  const [hasLoaded, setHasLoaded] = useState(false)

  useEffect(() => {
    if (clStatus !== null || clBackendError !== null) setHasLoaded(true)
  }, [clStatus, clBackendError])

  if (!hasLoaded) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-5 shadow-sm space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <Skeleton className="h-4 w-32 mb-4" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {clBackendError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-red-600 text-lg">⚠️</span>
            <div>
              <p className="font-semibold text-red-800 dark:text-red-300">Python Backend Not Running</p>
              <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                The causelist parser requires the Python backend server. Start it by running:
              </p>
              <code className="block mt-2 bg-red-100 dark:bg-red-900/40 px-3 py-2 rounded text-sm text-red-900 dark:text-red-200 font-mono">
                cd backend &amp;&amp; python run.py
              </code>
              <button
                onClick={onRetryConnection}
                className="mt-3 text-sm text-red-700 dark:text-red-300 underline hover:no-underline"
              >
                Retry connection
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-blue-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Last Import</h3>
          </div>
          {clStatus?.last_import ? (
            <div className="space-y-1.5 text-sm">
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">Date:</span>{" "}
                {clStatus.last_import.run_date ? formatDateTime(clStatus.last_import.run_date) : "—"}
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">Status:</span>{" "}
                {statusBadge(clStatus.last_import.status || "unknown")}
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">PDFs:</span> {clStatus.last_import.pdfs_found ?? 0} found,{" "}
                {clStatus.last_import.pdfs_downloaded ?? 0} downloaded
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">Cases:</span> {clStatus.last_import.cases_extracted ?? 0} extracted
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No imports yet</p>
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <FileSearch size={16} className="text-violet-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Checkpoint</h3>
          </div>
          {clStatus?.last_checkpoint ? (
            <div className="space-y-1.5 text-sm">
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">Last PDF:</span>{" "}
                <span className="font-mono text-xs break-all">{clStatus.last_checkpoint.checkpoint_identifier || "—"}</span>
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">Processed at:</span>{" "}
                {clStatus.last_checkpoint.last_processed_timestamp
                  ? formatDateTime(clStatus.last_checkpoint.last_processed_timestamp)
                  : "—"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No checkpoint set (first run)</p>
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} className="text-brand-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Current Session</h3>
          </div>
          {clStatus?.current_session ? (
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-amber-600" />
                <span className="text-amber-600 font-medium">Import running...</span>
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">Started:</span>{" "}
                {formatDateTime(clStatus.current_session.started_at || "")}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No active import</p>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Import Controls</h3>
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={clAutoDelete}
                onChange={(e) => setClAutoDelete(e.target.checked)}
                className="rounded border-gray-300 text-sidebar-primary focus:ring-sidebar-primary"
                disabled={clRunning}
              />
              <span className="flex items-center gap-1">
                <Trash2 size={13} />
                Auto-delete PDFs after parsing (saves storage)
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={clFromCheckpoint}
                onChange={(e) => setClFromCheckpoint(e.target.checked)}
                className="rounded border-gray-300 text-sidebar-primary focus:ring-sidebar-primary"
                disabled={clRunning}
              />
              <span>Start from last checkpoint (skip already processed)</span>
            </label>
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <label htmlFor="days-back">Import last</label>
              <select
                id="days-back"
                value={clDaysBack}
                onChange={(e) => setClDaysBack(Number(e.target.value))}
                disabled={clRunning}
                className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
              >
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </div>
          </div>
          <div className="md:ml-auto">
            <Button
              onClick={onStartImport}
              disabled={clRunning || !!clBackendError}
              className="gap-2"
              size="lg"
            >
              {clRunning ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play size={16} />
                  Start Cause List Import
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {(clRunning || clProgress.length > 0) && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal size={15} className="text-gray-600" />
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Progress Log</h3>
            </div>
            {clRunning && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600">
                <Loader2 size={12} className="animate-spin" />
                Processing...
              </div>
            )}
          </div>
          <div className="p-4 max-h-[400px] overflow-y-auto bg-gray-50 dark:bg-gray-950 font-mono text-xs space-y-1">
            {clProgress.length === 0 ? (
              <p className="text-gray-500">Waiting for updates...</p>
            ) : (
              clProgress.map((entry, i) => (
                <p
                  key={i}
                  className={cn(
                    "py-0.5",
                    entry.status === "error" ? "text-red-600" :
                    entry.status === "completed" ? "text-brand-600" :
                    "text-gray-700 dark:text-gray-300"
                  )}
                >
                  {progressIcon(entry.status)} {entry.message}
                </p>
              ))
            )}
          </div>
        </div>
      )}

      {clSummary && !clRunning && (
        <div className={cn(
          "rounded-xl border p-5 shadow-sm",
          clSummary.status === "completed"
            ? "bg-brand-50 dark:bg-brand-900/20 border-brand-200 dark:border-brand-800"
            : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
        )}>
          <div className="flex items-center gap-2 mb-3">
            {clSummary.status === "completed" ? (
              <CheckCircle2 size={18} className="text-brand-600" />
            ) : (
              <XCircle size={18} className="text-red-600" />
            )}
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Import {clSummary.status === "completed" ? "Complete" : "Failed"}
            </h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-gray-500 text-xs">PDFs Found</p>
              <p className="font-semibold text-gray-900 dark:text-white text-lg">{clSummary.pdfs_found ?? 0}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">PDFs Processed</p>
              <p className="font-semibold text-gray-900 dark:text-white text-lg">{clSummary.pdfs_processed ?? 0}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Cases Extracted</p>
              <p className="font-semibold text-gray-900 dark:text-white text-lg">{clSummary.cases_parsed ?? 0}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Errors</p>
              <p className={cn(
                "font-semibold text-lg",
                (clSummary.errors ?? 0) > 0 ? "text-red-600" : "text-gray-900 dark:text-white"
              )}>
                {clSummary.errors ?? 0}
              </p>
            </div>
          </div>
          {clSummary.execution_time_seconds && (
            <p className="text-xs text-gray-500 mt-2">
              Completed in {clSummary.execution_time_seconds}s
            </p>
          )}
        </div>
      )}
    </div>
  )
}
