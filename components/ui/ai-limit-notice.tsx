"use client"

import Link from "next/link"
import { Clock } from "lucide-react"

// The AI routes return 429 bodies like {"error":"...","details":{"limitReason":"daily","resetAt":"..."}}.
// useChat surfaces that body as error.message; parse it so limit hits get a friendly card instead of a raw error.
export function parseAiLimitError(message: string | undefined) {
  if (!message) return null
  try {
    const body = JSON.parse(message)
    if (!body?.details?.limitReason) return null
    return {
      message: (body.error as string) || "You've reached your AI usage limit.",
      reason: body.details.limitReason as string,
      resetAt: body.details.resetAt ? new Date(body.details.resetAt) : null,
    }
  } catch {
    return null
  }
}

export function AiLimitNotice({ limit }: { limit: NonNullable<ReturnType<typeof parseAiLimitError>> }) {
  const resetLabel = limit.resetAt
    ? limit.resetAt.toLocaleString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        day: limit.resetAt.getDate() !== new Date().getDate() ? "numeric" : undefined,
        month: limit.resetAt.getDate() !== new Date().getDate() ? "short" : undefined,
      })
    : null

  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
      <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
      <div className="flex-1 text-[13px] text-text-200">
        <p className="font-medium text-text-100">{limit.message}</p>
        <p className="text-text-300">
          {resetLabel ? `Your limit resets at ${resetLabel}.` : "Your limit resets soon."}{" "}
          <Link href="/pricing" className="text-accent hover:underline">
            Upgrade your plan
          </Link>{" "}
          for higher limits.
        </p>
      </div>
    </div>
  )
}
