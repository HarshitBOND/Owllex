"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import AiSettingsPage from "@/features/ai-settings/AiSettingsPage"

export default function Page() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/")
    }
  }, [isLoaded, isSignedIn, router])

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-10 h-10 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
      </div>
    )
  }

  return <AiSettingsPage />
}
