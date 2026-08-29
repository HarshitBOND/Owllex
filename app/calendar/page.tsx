"use client"

import { Suspense, useEffect } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { LoaderCircle } from "lucide-react"
import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"

const Calendar = dynamic(() => import("@/features/calendar").then((mod) => ({ default: mod.Calendar })), { ssr: false })

export default function CalendarPage() {
  const { isOpen } = useSidebar()
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
      <div className={cn("bg-[#F3F5F9] dark:bg-background min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0", "lg:ml-[var(--sidebar-offset)]")}>
        <div className="max-w-[1400px] w-full mx-auto px-3 sm:px-4 md:px-6 pt-3 md:pt-4">
          <Navbar location="Calendar" />
        </div>
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-96">
              <LoaderCircle className="animate-spin text-sidebar-primary" size={32} />
            </div>
          }
        >
          <Calendar />
        </Suspense>
      </div>
    </div>
  )
}
