"use client"

import { use } from "react"
import dynamic from "next/dynamic"
import { cn } from "@/lib/utils"

const DraftWorkspace = dynamic(() => import("@/features/draft-documents/components/DraftWorkspace"), {
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
    </div>
  ),
  ssr: false,
})

/**
 * The document fills the page: no app navbar, no card, no padding around it.
 * Everything this screen needs -- where you came from, what the document is,
 * export -- is in the document's own masthead.
 */
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  return (
    <div
      className={cn(
        "bg-white dark:bg-background h-screen w-full transition-all duration-300 flex flex-col pb-20 lg:pb-0",
        "lg:ml-[var(--sidebar-offset)]",
      )}
    >
      <DraftWorkspace draftId={id} />
    </div>
  )
}
