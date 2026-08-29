"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { Sparkles, type LucideIcon } from "lucide-react"
import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"

interface ComingSoonPageProps {
  title: string
  description: string
  icon?: LucideIcon
}

export function ComingSoonPage({ title, description, icon: Icon = Sparkles }: ComingSoonPageProps) {
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
        <div className="max-w-[1400px] w-full mx-auto px-3 sm:px-4 md:px-6 py-3 md:py-4">
          <Navbar location={title} />
          <div className="flex flex-col items-center justify-center text-center py-20 sm:py-28">
            <div className="w-16 h-16 mb-5 flex items-center justify-center rounded-2xl bg-accent/10">
              <Icon className="w-8 h-8 text-accent" />
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-foreground mb-2">
              {title}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground max-w-md">
              {description}
            </p>
            <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-border bg-white dark:bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              Coming soon
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
