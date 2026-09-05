"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { Briefcase, FileText, Library, MessageSquare } from "lucide-react"

import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import {
  N8nWorkflowBlock,
  type WorkflowConnection,
  type WorkflowNode,
} from "@/components/ui/n8n-workflow-block-shadcnui"
import { layoutNodes } from "@/features/ai-workflow/workflow-serialize"
import {
  initialWorkflowConnections,
  initialWorkflowNodes,
  legalNodeTemplates,
} from "@/lib/workflow-nodes"
import { useAiChat } from "@/contexts/AiChatContext"
import { accentFor } from "@/features/corpus/corpus-data"
import { cn } from "@/lib/utils"

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()
  const { corpora, setActiveCorpusId } = useAiChat()
  const [documentCount, setDocumentCount] = useState<number | null>(null)
  const [saved, setSaved] = useState<{
    nodes: WorkflowNode[]
    connections: WorkflowConnection[]
  } | null>(null)

  const corpus = corpora.find((c) => c.id === id) ?? null

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/")
    }
  }, [isLoaded, isSignedIn, router])

  useEffect(() => {
    fetch(`/api/corpus/${id}/documents`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDocumentCount((d.documents ?? []).length))
      .catch(() => {})
  }, [id])

  // The matter's own workflow, where one has been built or generated. The
  // starter chain is only a placeholder for a corpus that has none yet.
  useEffect(() => {
    fetch(`/api/corpus/${id}/workflow`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const workflow = d?.workflow
        if (!workflow?.nodes?.length) return
        setSaved({ nodes: layoutNodes(workflow.nodes), connections: workflow.connections ?? [] })
      })
      .catch(() => {})
  }, [id])

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-10 h-10 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
      </div>
    )
  }

  const accent = accentFor(corpus?.accent ?? "teal")

  return (
    <div className="flex">
      <Sidebar />
      <div
        className={cn(
          "bg-[#F3F5F9] dark:bg-background min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0",
          "lg:ml-[var(--sidebar-offset)]",
        )}
      >
        <div className="max-w-[1400px] w-full mx-auto px-3 sm:px-4 md:px-6 py-3 md:py-4">
          <Navbar withBack location="Corpus workflow" />

          <div className="mt-4 mb-5">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <div className={cn("w-10 h-10 flex items-center justify-center rounded-xl", accent.bgColor)}>
                <Library className={cn("w-5 h-5", accent.color)} />
              </div>
              <h1 className="font-serif text-xl sm:text-2xl font-semibold text-gray-900 dark:text-foreground">
                {corpus?.name ?? "Corpus workflow"}
              </h1>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => router.push(`/corpus/${id}`)}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-gray-200 dark:border-border bg-white dark:bg-card text-sm font-medium text-gray-700 dark:text-foreground hover:border-accent/40 transition-colors"
                >
                  <Briefcase className="w-4 h-4" />
                  Corpus
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveCorpusId(id)
                    router.push("/dashboard")
                  }}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  Chat
                </button>
              </div>
            </div>

            <p className="text-sm text-muted-foreground max-w-2xl">
              This pipeline runs against{" "}
              <span className="font-medium text-gray-700 dark:text-foreground">
                {corpus?.name ?? "this corpus"}
              </span>
              {corpus ? ` ${corpus.caseCount} case${corpus.caseCount === 1 ? "" : "s"}, ${corpus.clientCount} client${corpus.clientCount === 1 ? "" : "s"}` : ""}
              {documentCount !== null ? ` and ${documentCount} document${documentCount === 1 ? "" : "s"}` : ""}. Drag
              nodes to rearrange them, click a dot to pull a wire to another node, and click a wire to break it.
            </p>

            {documentCount === 0 && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <FileText className="w-3.5 h-3.5" />
                This corpus has no documents yet add some so the intake step has something to work on.
              </p>
            )}
          </div>

          <N8nWorkflowBlock
            // Seeds its node state at mount, so the saved workflow arriving
            // after the first render only shows if the block is remounted.
            key={saved ? "saved" : "starter"}
            label={corpus ? `${corpus.name} Workflow` : "Corpus Workflow"}
            nodes={saved?.nodes ?? initialWorkflowNodes}
            connections={saved?.connections ?? initialWorkflowConnections}
            templates={legalNodeTemplates}
            className="bg-white dark:bg-card border-gray-200 dark:border-border"
          />
        </div>
      </div>
    </div>
  )
}
