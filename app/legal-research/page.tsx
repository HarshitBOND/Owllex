"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import { cn } from "@/lib/utils"
import DeepResearch from "@/features/legal-research/DeepResearch"

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

  return (
    <div className="flex">
      <Sidebar />
      <div
        className={cn(
          "bg-[#F3F5F9] dark:bg-background min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0",
          "lg:ml-[var(--sidebar-offset)]",
        )}
      >
        <div className="px-3 sm:px-4 md:px-6 pt-3 md:pt-4">
          <Navbar
            location="Deep Research"
            subtitle="Multi-step legal research over your own corpus — retrieved, cited, and verified before you see it."
          />
        </div>
        <div className="px-3 sm:px-4 md:px-6 pb-6 pt-4">
          <DeepResearch />
        </div>
      </div>
    </div>
  )
}
