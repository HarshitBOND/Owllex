"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { ChevronDown, Download, HelpCircle, Share2 } from "lucide-react"
import dynamic from "next/dynamic"
import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const ContractReviewWorkspace = dynamic(
  () => import("@/features/contract-review/components/ContractReviewWorkspace"),
  {
    loading: () => (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
      </div>
    ),
    ssr: false,
  },
)

export default function Page() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()

  const [downloadLabel, setDownloadLabel] = useState("Download report")
  const [shareLabel, setShareLabel] = useState("Share report")
  const [workspaceStatus, setWorkspaceStatus] = useState<"idle" | "analyzing" | "ready">("idle")
  const [showHowItWorks, setShowHowItWorks] = useState(false)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ revisionCount: number; sourceCount: number; createdAt: string } | null>(null)
  const howItWorksRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (howItWorksRef.current && !howItWorksRef.current.contains(event.target as Node)) {
        setShowHowItWorks(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

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

  const handleDownloadReport = (format: "docx" | "pdf") => {
    if (!reviewId) return
    window.location.href = `/api/contract-review/${reviewId}/export?format=${format}`
    setDownloadLabel("Downloaded")
    setTimeout(() => setDownloadLabel("Download report"), 1500)
  }

  const handleShareReport = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareLabel("Link copied")
    } catch {
      setShareLabel("Share report")
    }
    setTimeout(() => setShareLabel("Share report"), 1500)
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
            location="Contract Review"
            subtitle={
              // Harvey-style provenance line once there is a document to
              // describe; the pitch only helps before one is loaded.
              meta
                ? [
                    "Draft",
                    `${meta.revisionCount} revision${meta.revisionCount === 1 ? "" : "s"}`,
                    `${meta.sourceCount} source${meta.sourceCount === 1 ? "" : "s"}`,
                    `Created ${meta.createdAt}`,
                  ].join(" · ")
                : "Upload a contract and get AI-powered review with actionable insights."
            }
            badge="Beta"
            actions={
              workspaceStatus === "ready" ? (
                <div className="hidden sm:flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="h-8 px-3 rounded-lg border border-gray-200 dark:border-border flex items-center justify-center gap-1.5 text-[12.5px] font-medium text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-secondary transition-colors min-w-[150px]"
                      >
                        <Download className="w-3.5 h-3.5 shrink-0" />
                        {downloadLabel}
                        <ChevronDown className="w-3 h-3 shrink-0" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleDownloadReport("docx")}>Word (.docx)</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownloadReport("pdf")}>PDF (.pdf)</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button
                    type="button"
                    onClick={handleShareReport}
                    className="h-8 px-3 rounded-lg bg-gray-900 dark:bg-accent text-white flex items-center justify-center gap-1.5 text-[12.5px] font-medium hover:opacity-90 transition-opacity min-w-[126px]"
                  >
                    <Share2 className="w-3.5 h-3.5 shrink-0" />
                    {shareLabel}
                  </button>
                </div>
              ) : (
                <div className="hidden sm:flex items-center gap-2">
                  <div className="relative" ref={howItWorksRef}>
                    <button
                      type="button"
                      onClick={() => setShowHowItWorks((v) => !v)}
                      className="h-8 px-3 rounded-lg border border-gray-200 dark:border-border flex items-center gap-1.5 text-[12.5px] font-medium text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-secondary transition-colors"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      How it works
                    </button>
                    {showHowItWorks && (
                      <div className="absolute right-0 top-10 w-72 bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 shadow-xl z-[200] p-4">
                        <p className="text-sm font-semibold text-gray-900 dark:text-foreground mb-3">
                          How Contract Review works
                        </p>
                        <ol className="space-y-2.5">
                          {[
                            "Upload a PDF, DOCX, TXT, or scanned image.",
                            "We extract the text (with OCR for scans) and our AI scans every clause for risk.",
                            "Review flagged issues, edit the document, or ask AI to fix a clause.",
                            "Download or share the finished report.",
                          ].map((step, i) => (
                            <li
                              key={step}
                              className="flex items-start gap-2 text-[12.5px] text-gray-600 dark:text-muted-foreground"
                            >
                              <span className="w-4 h-4 rounded-full bg-accent/10 text-accent text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                {i + 1}
                              </span>
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                </div>
              )
            }
          />
        </div>
        <div className="px-3 sm:px-4 md:px-6 pb-6">
          <ContractReviewWorkspace
            onStatusChange={setWorkspaceStatus}
            onReviewIdChange={setReviewId}
            onMetaChange={setMeta}
          />
        </div>
      </div>
    </div>
  )
}
