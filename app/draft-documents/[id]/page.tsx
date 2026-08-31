"use client"

import { use } from "react"
import dynamic from "next/dynamic"
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

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

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
      <div className="flex-1 min-h-0 px-3 sm:px-4 md:px-6 pb-3 md:pb-4 mt-1">
        <DraftWorkspace draftId={id} />
      </div>
    </div>
  )
}
