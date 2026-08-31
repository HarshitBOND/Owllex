"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RotateCw } from "lucide-react"

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[APP_ERROR]", error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-14 h-14 mx-auto mb-6 flex items-center justify-center rounded-2xl bg-destructive/10">
          <AlertTriangle className="w-7 h-7 text-destructive" />
        </div>
        <h1 className="font-serif text-2xl font-medium text-foreground mb-2">Something went wrong</h1>
        <p className="text-sm text-muted-foreground mb-6">
          An unexpected error occurred. You can retry, or head back to your dashboard.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/70 font-mono mb-6">Reference: {error.digest}</p>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <RotateCw className="w-4 h-4" />
            Try again
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
