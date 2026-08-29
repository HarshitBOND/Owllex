"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import dynamic from "next/dynamic"
import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import { cn } from "@/lib/utils"

const DraftWorkspace = dynamic(() => import("@/features/draft-documents/components/DraftWorkspace"), {
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
    </div>
  ),
  ssr: false,
})

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
          "bg-[#F3F5F9] dark:bg-background h-screen w-full transition-all duration-300 flex flex-col pb-20 lg:pb-0",
          "lg:ml-[var(--sidebar-offset)]",
        )}
      >
        <div className="px-3 sm:px-4 md:px-6 pt-3 md:pt-4 shrink-0">
          <Navbar location="Draft Documents" />
        </div>
        <div className="flex-1 min-h-0 px-3 sm:px-4 md:px-6 pb-3 md:pb-4 mt-1">
          <DraftWorkspace />
        </div>
      </div>
    </div>
  )
}
