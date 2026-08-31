"use client"

import { useEffect } from "react"
import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { AiChatHome } from "@/features/dashboard/ai-chat-home"

const DashboardHome = () => {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/")
    }
  }, [isLoaded, isSignedIn, router])

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading your workspace...</p>
        </div>
      </div>
    )
  }
  if (!isSignedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-sm text-muted-foreground">Redirecting...</div>
      </div>
    )
  }

  return (
    <div className="flex">
      <Sidebar />
      <div
        className={cn(
          "bg-bg-0 flex flex-col h-[100dvh] w-full transition-all duration-300 pb-16 lg:pb-0",
          "lg:ml-[var(--sidebar-offset)]"
        )}
      >
        <div className="shrink-0 max-w-[1400px] w-full mx-auto px-3 sm:px-4 md:px-6 pt-3 md:pt-4">
          <Navbar location="Agentic AI Assistant" />
        </div>
        <main className="flex-1 min-h-0">
          <AiChatHome />
        </main>
      </div>
    </div>
  )
}

export default DashboardHome
