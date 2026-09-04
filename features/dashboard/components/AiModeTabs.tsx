"use client"

import { motion, useReducedMotion } from "framer-motion"
import { FileText, MessageSquare, History } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The three things an advocate does on this page: ask, draft, and pick up
 * something they were part way through.
 *
 * Panels swap in place rather than navigating, because Draft and Revisions are
 * ways of starting work on this screen -- sending someone to a different route
 * to choose a form and then back again is the flow this replaces.
 */

export type AiMode = "assistant" | "draft" | "revisions"

const TABS: { key: AiMode; label: string; icon: typeof MessageSquare }[] = [
  { key: "assistant", label: "Assistant", icon: MessageSquare },
  { key: "draft", label: "Draft", icon: FileText },
  { key: "revisions", label: "Revisions", icon: History },
]

export default function AiModeTabs({
  mode,
  onChange,
  className,
}: {
  mode: AiMode
  onChange: (mode: AiMode) => void
  className?: string
}) {
  const reduceMotion = useReducedMotion()

  return (
    <div
      role="tablist"
      aria-label="What would you like to do"
      className={cn("flex items-center gap-1 border-b border-bg-300", className)}
    >
      {TABS.map(({ key, label, icon: Icon }) => {
        const active = mode === key
        return (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 rounded-t",
              active ? "text-text-100" : "text-text-400 hover:text-text-200"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {active && (
              <motion.span
                // One shared layoutId slides the underline between tabs rather
                // than fading a new one in under each.
                layoutId="ai-mode-underline"
                className="absolute left-0 right-0 -bottom-px h-[2px] bg-accent rounded-full"
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 380, damping: 32 }
                }
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
