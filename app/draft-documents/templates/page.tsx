"use client"

import { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus } from "lucide-react"
import Navbar from "@/components/layout/navbar"
import { cn } from "@/lib/utils"
import DocumentTemplatesLibrary from "@/features/draft-documents/components/DocumentTemplatesLibrary"

function Library() {
  const searchParams = useSearchParams()
  return (
    <DocumentTemplatesLibrary
      initialCorpusId={searchParams.get("corpusId") ?? undefined}
      initialCaseId={searchParams.get("caseId") ?? undefined}
    />
  )
}

export default function Page() {
  const router = useRouter()

  return (
    <div
      className={cn(
        "bg-[#F3F5F9] dark:bg-background min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0",
        "lg:ml-[var(--sidebar-offset)]",
      )}
    >
      <div className="px-3 sm:px-4 md:px-6 pt-3 md:pt-4">
        <Navbar
          withBack
          location="More documents"
          subtitle="Browse and use the templates your administrator has published."
          actions={
            <button
              type="button"
              onClick={() => router.push("/draft-documents/new")}
              className="hidden sm:inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Start from scratch
            </button>
          }
        />
      </div>
      <div className="px-3 sm:px-4 md:px-6 pb-6">
        <Suspense fallback={null}>
          <Library />
        </Suspense>
      </div>
    </div>
  )
}
