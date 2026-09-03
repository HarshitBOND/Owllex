"use client"

import type { ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/** Panel heading: the section title that opens the right-hand pane. */
export function PanelHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-1">
      <h2 className="text-[15px] font-semibold text-gray-900 dark:text-foreground">{title}</h2>
      {description ? (
        <p className="text-[13px] text-gray-500 dark:text-muted-foreground mt-1">{description}</p>
      ) : null}
    </div>
  )
}

/** A labelled group of rows, separated by hairlines. */
export function RowGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mt-7 first:mt-5">
      {title ? (
        <h3 className="text-[15px] font-semibold text-gray-900 dark:text-foreground mb-1">{title}</h3>
      ) : null}
      <div className="divide-y divide-gray-100 dark:divide-border">{children}</div>
    </section>
  )
}

/** Label on the left, control on the right — the shape every settings line takes. */
export function Row({
  label,
  hint,
  children,
  align = "center",
}: {
  label: ReactNode
  hint?: ReactNode
  children?: ReactNode
  align?: "center" | "start"
}) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row gap-2 sm:gap-6 py-4",
        align === "center" ? "sm:items-center" : "sm:items-start",
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] text-gray-800 dark:text-foreground">{label}</p>
        {hint ? (
          <p className="text-[12.5px] text-gray-500 dark:text-muted-foreground mt-0.5 leading-relaxed">{hint}</p>
        ) : null}
      </div>
      {children ? <div className="shrink-0 sm:min-w-[240px] sm:flex sm:justify-end">{children}</div> : null}
    </div>
  )
}

export function Select({
  value,
  onChange,
  options,
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <div className={cn("relative w-full sm:w-[260px]", className)}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full appearance-none rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-input pl-3 pr-9 text-[13px] text-gray-800 dark:text-foreground hover:border-gray-300 dark:hover:border-accent/40 focus:border-accent focus:outline-none transition-colors"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative w-10 h-[22px] rounded-full shrink-0 transition-colors",
        checked ? "bg-accent" : "bg-gray-200 dark:bg-secondary",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform",
          checked && "translate-x-[18px]",
        )}
      />
    </button>
  )
}

/** Small pill used for plan names and statuses. */
export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "warn" | "danger" }) {
  return (
    <span
      className={cn(
        "text-[11px] px-2 py-0.5 rounded-full border font-medium capitalize",
        tone === "brand" && "bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 border-brand-200 dark:border-brand-500/30",
        tone === "warn" && "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30",
        tone === "danger" && "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30",
        tone === "neutral" && "bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground border-gray-200 dark:border-border",
      )}
    >
      {children}
    </span>
  )
}
