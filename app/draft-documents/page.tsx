"use client"

import Navbar from "@/components/layout/navbar"
import { cn } from "@/lib/utils"
import DraftDocumentsHome from "@/features/draft-documents/components/DraftDocumentsHome"

export default function Page() {
  return (
    <div
      className={cn(
        "bg-[#F3F5F9] dark:bg-background min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0",
        "lg:ml-[var(--sidebar-offset)]",
      )}
    >
      <div className="px-3 sm:px-4 md:px-6 pt-3 md:pt-4">
        <Navbar
          location="Draft Document"
          subtitle="Create professional legal documents in minutes with your AI assistant."
        />
      </div>
      <div className="px-3 sm:px-4 md:px-6 pb-6">
        <DraftDocumentsHome />
      </div>
    </div>
  )
}
