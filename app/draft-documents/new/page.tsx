"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertCircle } from "lucide-react"
import Navbar from "@/components/layout/navbar"
import { cn } from "@/lib/utils"

function Creating() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const started = useRef(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (started.current) return
    started.current = true

    const templateId = searchParams.get("templateId")
    const prompt = searchParams.get("prompt")

    fetch("/api/draft-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(templateId ? { templateId } : {}),
        ...(prompt ? { seedPrompt: prompt.slice(0, 2000) } : {}),
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.id) router.replace(`/draft-documents/${data.id}`)
        else setError(data.error || "We couldn't start that document.")
      })
      .catch(() => setError("We couldn't reach the server. Check your connection and try again."))
  }, [router, searchParams])

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="max-w-sm text-center rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-8">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
          <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-foreground">Couldn&apos;t start document</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">{error}</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                started.current = false
                setError("")
                router.refresh()
                window.location.reload()
              }}
              className="text-xs font-medium border border-gray-200 dark:border-border rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-secondary transition-colors"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => router.push("/draft-documents")}
              className="text-xs font-medium text-white bg-accent rounded-lg px-3 py-2 hover:opacity-90 transition-opacity"
            >
              Back to documents
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
      <p className="text-sm text-gray-500 dark:text-muted-foreground">Preparing your document...</p>
    </div>
  )
}

export default function Page() {
  return (
    <div
      className={cn(
        "bg-[#F3F5F9] dark:bg-background h-screen w-full transition-all duration-300 flex flex-col pb-20 lg:pb-0",
        "lg:ml-[var(--sidebar-offset)]",
      )}
    >
      <div className="px-3 sm:px-4 md:px-6 pt-3 md:pt-4 shrink-0">
        <Navbar withBack location="Draft Documents" />
      </div>
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
          </div>
        }
      >
        <Creating />
      </Suspense>
    </div>
  )
}
