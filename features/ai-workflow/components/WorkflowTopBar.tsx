"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { UserButton } from "@clerk/nextjs"
import { Bell, Check, ChevronDown, Hand, Library, Maximize2, Minus, MousePointer2, Plus, Workflow } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CorpusSummary } from "@/features/corpus/types"

interface WorkflowTopBarProps {
  panMode: boolean
  onPanModeChange: (pan: boolean) => void
  scalePct: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onFitView: () => void
  corpora: CorpusSummary[]
}

export default function WorkflowTopBar({
  panMode,
  onPanModeChange,
  scalePct,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onFitView,
  corpora,
}: WorkflowTopBarProps) {
  const router = useRouter()
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  return (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 dark:border-border bg-white dark:bg-card px-4 sm:px-5">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 dark:bg-foreground text-white dark:text-background">
          <Workflow className="h-4 w-4" />
        </div>
        <h1 className="text-[15px] font-semibold text-gray-900 dark:text-foreground truncate">AI Workflow</h1>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Active
        </span>
      </div>

      <div className="flex-1 flex items-center justify-center min-w-0">
        <div className="hidden md:flex items-center rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card p-0.5 shadow-sm">
          <button
            type="button"
            title="Select"
            onClick={() => onPanModeChange(false)}
            className={cn("flex h-7 w-7 items-center justify-center rounded-md transition-colors", !panMode ? "bg-gray-900 dark:bg-foreground text-white dark:text-background" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-secondary")}
          >
            <MousePointer2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Pan"
            onClick={() => onPanModeChange(true)}
            className={cn("flex h-7 w-7 items-center justify-center rounded-md transition-colors", panMode ? "bg-gray-900 dark:bg-foreground text-white dark:text-background" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-secondary")}
          >
            <Hand className="h-3.5 w-3.5" />
          </button>

          <span className="mx-1 h-4 w-px bg-gray-200 dark:bg-border" />

          <button type="button" title="Zoom out" onClick={onZoomOut} className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-secondary transition-colors">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Reset zoom" onClick={onZoomReset} className="w-11 text-center text-[11px] tabular-nums text-gray-600 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground transition-colors">
            {scalePct}%
          </button>
          <button type="button" title="Zoom in" onClick={onZoomIn} className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-secondary transition-colors">
            <Plus className="h-3.5 w-3.5" />
          </button>

          <span className="mx-1 h-4 w-px bg-gray-200 dark:bg-border" />

          <button type="button" title="Fit view" onClick={onFitView} className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-secondary transition-colors">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-expanded={pickerOpen}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card text-sm font-medium text-gray-700 dark:text-foreground hover:border-accent/40 transition-colors"
          >
            <Library className="w-4 h-4 text-gray-500 dark:text-muted-foreground" />
            <span className="hidden sm:inline">Run against a corpus</span>
            <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", pickerOpen && "rotate-180")} />
          </button>

          {pickerOpen && (
            <div className="absolute right-0 top-full mt-2 w-[280px] bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col p-1.5 animate-fade-in">
              <div className="max-h-[280px] overflow-y-auto custom-scrollbar flex flex-col">
                {corpora.length === 0 && (
                  <p className="px-3 py-3 text-xs text-gray-500 dark:text-muted-foreground leading-relaxed">
                    No corpus yet. Create one to run this pipeline against a specific matter&apos;s cases and documents.
                  </p>
                )}
                {corpora.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setPickerOpen(false)
                      router.push(`/corpus/${c.id}/workflow`)
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-secondary/60 transition-colors"
                  >
                    <Library className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-gray-900 dark:text-foreground truncate">{c.name}</span>
                      <span className="block text-[11px] text-gray-500 dark:text-muted-foreground">
                        {c.caseCount} case{c.caseCount === 1 ? "" : "s"} &middot; {c.documentCount} doc{c.documentCount === 1 ? "" : "s"}
                      </span>
                    </span>
                    <Check className="w-4 h-4 text-transparent shrink-0" />
                  </button>
                ))}
              </div>

              <div className="h-px bg-gray-100 dark:bg-border my-1 mx-2" />

              <button
                type="button"
                onClick={() => {
                  setPickerOpen(false)
                  router.push("/corpus")
                }}
                className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-secondary/60 transition-colors"
              >
                <Library className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-[13px] font-semibold text-gray-900 dark:text-foreground">Manage corpus</span>
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
          aria-label="Notifications"
        >
          <Bell size={19} className="text-gray-600 dark:text-muted-foreground" />
        </button>

        <UserButton />
      </div>
    </div>
  )
}
