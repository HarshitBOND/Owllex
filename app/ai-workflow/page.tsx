"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { Sparkles } from "lucide-react"

import Sidebar from "@/components/layout/sidebar"
import { useSidebar } from "@/contexts/SidebarContext"
import {
  WorkflowCanvasImmersive,
  type WorkflowCanvasHandle,
} from "@/features/ai-workflow/components/WorkflowCanvasImmersive"
import WorkflowTopBar from "@/features/ai-workflow/components/WorkflowTopBar"
import WorkflowAiChatPanel, {
  type WorkflowAiChatPanelHandle,
} from "@/features/ai-workflow/components/WorkflowAiChatPanel"
import type { WorkflowConnection, WorkflowNode } from "@/components/ui/n8n-workflow-block-shadcnui"
import {
  initialWorkflowConnections,
  initialWorkflowNodes,
  legalNodeTemplates,
} from "@/lib/workflow-nodes"
import { layoutNodes, serializeNodes } from "@/features/ai-workflow/workflow-serialize"
import { useAiChat } from "@/contexts/AiChatContext"
import { cn } from "@/lib/utils"

/**
 * Picks up what an approved "build the workflow" step left in the URL: the
 * brief to build from, and the matter the result belongs to.
 *
 * Separate, and inside a Suspense boundary, because useSearchParams opts the
 * whole tree into client rendering otherwise -- the same shape the draft
 * document pages use for their prefill params.
 */
function WorkflowQueryParams({
  onParams,
}: {
  onParams: (params: { brief: string | null; corpusId: string | null }) => void
}) {
  const searchParams = useSearchParams()
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true
    onParams({ brief: searchParams.get("brief"), corpusId: searchParams.get("corpusId") })
  }, [searchParams, onParams])

  return null
}

export default function AiWorkflowPage() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()
  const { corpora } = useAiChat()
  const { isOpen, setIsOpen } = useSidebar()
  const canvasRef = useRef<WorkflowCanvasHandle>(null)
  const chatPanelRef = useRef<WorkflowAiChatPanelHandle>(null)

  // Immersive canvas mode: collapse the app rail to an icon strip while this
  // page is open, and put it back the way the user had it on the way out.
  const sidebarWasOpenRef = useRef<boolean | null>(null)
  useEffect(() => {
    sidebarWasOpenRef.current = isOpen
    setIsOpen(false)
    return () => {
      if (sidebarWasOpenRef.current !== null) setIsOpen(sidebarWasOpenRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [panMode, setPanMode] = useState(false)
  const [scale, setScale] = useState(1)
  const [assistantOpen, setAssistantOpen] = useState(true)
  const [pinned, setPinned] = useState(true)
  const [seedPrompt, setSeedPrompt] = useState("")
  const [corpusId, setCorpusId] = useState<string | null>(null)

  // Arriving with a brief means the assistant panel has work to do the moment
  // it mounts, so it is opened whether or not it was the last state.
  const takeParams = useCallback((params: { brief: string | null; corpusId: string | null }) => {
    setCorpusId(params.corpusId)
    if (params.brief) {
      setSeedPrompt(params.brief)
      setAssistantOpen(true)
    }
  }, [])

  // Mirrors the canvas's live graph (manual edits included) so the AI chat
  // panel always sends accurate context, and lets an AI proposal replace it.
  const [workflow, setWorkflow] = useState<{ nodes: WorkflowNode[]; connections: WorkflowConnection[] }>({
    nodes: initialWorkflowNodes,
    connections: initialWorkflowConnections,
  })
  const [canvasRevision, setCanvasRevision] = useState(0)

  const handleCanvasChange = useCallback((nodes: WorkflowNode[], connections: WorkflowConnection[]) => {
    setWorkflow({ nodes, connections })
  }, [])

  const applyAiWorkflow = useCallback((nodes: WorkflowNode[], connections: WorkflowConnection[]) => {
    setWorkflow({ nodes, connections })
    setCanvasRevision((r) => r + 1)
  }, [])

  // Nothing is written back until the saved workflow has been read, or the
  // starter chain would overwrite the matter's real one before it arrives.
  const loaded = useRef(false)

  useEffect(() => {
    if (!corpusId) return
    let cancelled = false

    fetch(`/api/corpus/${corpusId}/workflow`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return
        const saved = data?.workflow
        if (saved?.nodes?.length) {
          applyAiWorkflow(layoutNodes(saved.nodes), saved.connections ?? [])
        }
        loaded.current = true
      })
      .catch(() => {
        // Leaving loaded false is deliberate: if the matter's workflow could
        // not be read, saving over it would be worse than not saving at all.
      })

    return () => {
      cancelled = true
    }
  }, [corpusId, applyAiWorkflow])

  // Every change to the canvas -- the assistant's or the advocate's own -- is
  // filed against the matter, debounced so a drag does not write on every frame.
  useEffect(() => {
    if (!corpusId || !loaded.current) return

    const timer = window.setTimeout(() => {
      fetch(`/api/corpus/${corpusId}/workflow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodes: serializeNodes(workflow.nodes),
          connections: workflow.connections,
        }),
      }).catch(() => {})
    }, 1200)

    return () => window.clearTimeout(timer)
  }, [corpusId, workflow])

  // Always gives visible feedback: opens the panel if it was closed, and
  // focuses the input either way so the click is never a no-op.
  const requestAssistant = useCallback(() => {
    setAssistantOpen(true)
    requestAnimationFrame(() => chatPanelRef.current?.focusInput())
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

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F8FA] dark:bg-background">
      <Suspense fallback={null}>
        <WorkflowQueryParams onParams={takeParams} />
      </Suspense>
      <Sidebar />
      <div className={cn("flex flex-col h-screen w-full min-w-0", "lg:ml-[var(--sidebar-offset)]")}>
        <WorkflowTopBar
          panMode={panMode}
          onPanModeChange={setPanMode}
          scalePct={Math.round(scale * 100)}
          onZoomIn={() => canvasRef.current?.zoomIn()}
          onZoomOut={() => canvasRef.current?.zoomOut()}
          onZoomReset={() => canvasRef.current?.resetZoom()}
          onFitView={() => canvasRef.current?.fitView()}
          corpora={corpora}
        />

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 p-3 sm:p-4">
          <div className="flex-1 min-w-0 min-h-0">
            <WorkflowCanvasImmersive
              key={canvasRevision}
              ref={canvasRef}
              nodes={workflow.nodes}
              connections={workflow.connections}
              onChange={handleCanvasChange}
              onScaleChange={setScale}
              onRequestAssistant={requestAssistant}
              panMode={panMode}
              className="h-full"
            />
          </div>

          {assistantOpen && (
            <WorkflowAiChatPanel
              ref={chatPanelRef}
              chatId="ai-workflow"
              currentWorkflow={workflow}
              onApply={applyAiWorkflow}
              templates={legalNodeTemplates}
              onAddNode={(template) => canvasRef.current?.addNode(template)}
              pinned={pinned}
              onTogglePin={() => setPinned((v) => !v)}
              onClose={() => setAssistantOpen(false)}
              seedPrompt={seedPrompt}
            />
          )}
        </div>
      </div>

      {!assistantOpen && (
        <button
          type="button"
          onClick={() => setAssistantOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-lg hover:bg-accent-hover transition-colors"
          aria-label="Open AI assistant"
        >
          <Sparkles className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}
