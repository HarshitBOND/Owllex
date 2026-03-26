"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressProps {
  value?: number
  className?: string
  [key: string]: any
}

const WIDTH_CLASS_BY_BUCKET: Record<number, string> = {
  0: "w-0",
  5: "w-[5%]",
  10: "w-[10%]",
  15: "w-[15%]",
  20: "w-[20%]",
  25: "w-1/4",
  30: "w-[30%]",
  35: "w-[35%]",
  40: "w-2/5",
  45: "w-[45%]",
  50: "w-1/2",
  55: "w-[55%]",
  60: "w-3/5",
  65: "w-[65%]",
  70: "w-[70%]",
  75: "w-3/4",
  80: "w-4/5",
  85: "w-[85%]",
  90: "w-[90%]",
  95: "w-[95%]",
  100: "w-full",
}

const getWidthClass = (value: number) => {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  const bucket = Math.round(clamped / 5) * 5
  return WIDTH_CLASS_BY_BUCKET[bucket] ?? "w-0"
}

const Progress = React.forwardRef<
  HTMLDivElement,
  ProgressProps
>(({ className, value = 0, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative h-2 w-full overflow-hidden rounded-full bg-secondary",
      className
    )}
    {...props}
  >
    <div
      className={cn("h-full bg-primary transition-all", getWidthClass(value))}
    />
  </div>
))
Progress.displayName = "Progress"

export { Progress }
