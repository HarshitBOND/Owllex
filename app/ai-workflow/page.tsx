"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { Sparkles } from "lucide-react"

import Sidebar from "@/components/layout/sidebar"
import { useSidebar } from "@/contexts/SidebarContext"
import {
  WorkflowCanvasImmersive,
  type WorkflowCanvasHandle,
} from "@/features/ai-workflow/components/WorkflowCanvasImmersive"
import WorkflowTopBar from "@/features/ai-workflow/components/WorkflowTopBar"
import WorkflowAiChatPanel from "@/features/ai-workflow/components/WorkflowAiChatPanel"
import type { WorkflowConnection, WorkflowNode } from "@/components/ui/n8n-workflow-block-shadcnui"
import {
  initialWorkflowConnections,
  initialWorkflowNodes,
  legalNodeTemplates,
} from "@/lib/workflow-nodes"
import { useAiChat } from "@/contexts/AiChatContext"
import { cn } from "@/lib/utils"

export default function AiWorkflowPage() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()
  const { corpora } = useAiChat()
  const { isOpen, setIsOpen } = useSidebar()
  const canvasRef = useRef<WorkflowCanvasHandle>(null)

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
              onRequestAssistant={() => setAssistantOpen(true)}
              panMode={panMode}
              className="h-full"
            />
          </div>

          {assistantOpen && (
            <WorkflowAiChatPanel
              chatId="ai-workflow"
              currentWorkflow={workflow}
              onApply={applyAiWorkflow}
              templates={legalNodeTemplates}
              onAddNode={(template) => canvasRef.current?.addNode(template)}
              pinned={pinned}
              onTogglePin={() => setPinned((v) => !v)}
              onClose={() => setAssistantOpen(false)}
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
