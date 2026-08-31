"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { Check, ChevronDown, FileCheck2, Library, Plus } from "lucide-react"

import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import { N8nWorkflowBlock } from "@/components/ui/n8n-workflow-block-shadcnui"
import {
  initialWorkflowConnections,
  initialWorkflowNodes,
  legalNodeTemplates,
} from "@/lib/workflow-nodes"
import { useAiChat } from "@/contexts/AiChatContext"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"

export default function AiWorkflowPage() {
  useSidebar()
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()
  const { corpora } = useAiChat()
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/")
    }
  }, [isLoaded, isSignedIn, router])

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

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
          <Navbar location="AI Workflow" />

          <div className="mt-4 mb-5">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-accent/10">
                <FileCheck2 className="w-5 h-5 text-accent" />
              </div>
              <h1 className="font-serif text-xl sm:text-2xl font-semibold text-gray-900 dark:text-foreground">
                AI Workflow
              </h1>

              <div className="relative ml-auto" ref={pickerRef}>
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  aria-expanded={pickerOpen}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-gray-200 dark:border-border bg-white dark:bg-card text-sm font-medium text-gray-700 dark:text-foreground hover:border-accent/40 transition-colors"
                >
                  <Library className="w-4 h-4 text-gray-500 dark:text-muted-foreground" />
                  Run against a corpus
                  <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", pickerOpen && "rotate-180")} />
                </button>

                {pickerOpen && (
                  <div className="absolute right-0 top-full mt-2 w-[280px] bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col p-1.5 animate-fade-in">
                    <div className="max-h-[280px] overflow-y-auto custom-scrollbar flex flex-col">
                      {corpora.length === 0 && (
                        <p className="px-3 py-3 text-xs text-gray-500 dark:text-muted-foreground leading-relaxed">
                          No corpus yet. Create one to run this pipeline against a specific matter&apos;s cases and
                          documents.
                        </p>
                      )}
                      {corpora.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setPickerOpen(false)
                            router.push(`/corpus/${c.id}/workflow`)
                          }}
                          className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-secondary/60 transition-colors"
                        >
                          <Library className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold text-gray-900 dark:text-foreground truncate">
                              {c.name}
                            </span>
                            <span className="block text-[11px] text-gray-500 dark:text-muted-foreground">
                              {c.caseCount} case{c.caseCount === 1 ? "" : "s"} &middot; {c.documentCount} doc
                              {c.documentCount === 1 ? "" : "s"}
                            </span>
                          </span>
                          <Check className="w-4 h-4 text-transparent shrink-0" />
                        </button>
                      ))}
                    </div>

                    <div className="h-px bg-gray-100 dark:bg-border my-1 mx-2" />

                    <button
                      type="button"
                      onClick={() => {
                        setPickerOpen(false)
                        router.push("/corpus")
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-secondary/60 transition-colors"
                    >
                      <Plus className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="text-[13px] font-semibold text-gray-900 dark:text-foreground">
                        Manage corpus
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <p className="text-sm text-muted-foreground max-w-2xl">
              Chain the AI tools into a repeatable pipeline — intake a document, extract
              its clauses, check risk and citations, then draft and send the response.
              Drag nodes to rearrange them, click a dot to pull a wire to another node,
              and click a wire to break it. Pick a corpus to run it against a specific matter.
            </p>
          </div>

          <N8nWorkflowBlock
            label="Legal Workflow Builder"
            nodes={initialWorkflowNodes}
            connections={initialWorkflowConnections}
            templates={legalNodeTemplates}
            className="bg-white dark:bg-card border-gray-200 dark:border-border"
          />
        </div>
      </div>
    </div>
  )
}
