"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import {
  FileCheck2,
  FileEdit,
  Gavel,
  Mail,
  Quote,
  ScanText,
  ShieldAlert,
  Upload,
} from "lucide-react"

import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import {
  N8nWorkflowBlock,
  type WorkflowConnection,
  type WorkflowNode,
  type WorkflowNodeTemplate,
} from "@/components/ui/n8n-workflow-block-shadcnui"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"

/** Steps the "Add Node" button draws from. */
const legalNodeTemplates: WorkflowNodeTemplate[] = [
  {
    type: "trigger",
    title: "Document Upload",
    description: "Client uploads a contract or filing",
    icon: Upload,
    color: "emerald",
  },
  {
    type: "action",
    title: "Extract Clauses",
    description: "Parse the document into structured clauses",
    icon: ScanText,
    color: "blue",
  },
  {
    type: "action",
    title: "Case Law Lookup",
    description: "Retrieve precedent relevant to each clause",
    icon: Gavel,
    color: "indigo",
  },
  {
    type: "condition",
    title: "Risk Check",
    description: "Flag clauses above the risk threshold",
    icon: ShieldAlert,
    color: "amber",
  },
  {
    type: "action",
    title: "Verify Citations",
    description: "Confirm every citation is still good law",
    icon: Quote,
    color: "indigo",
  },
  {
    type: "action",
    title: "Draft Response",
    description: "Generate a redline or advisory memo",
    icon: FileEdit,
    color: "purple",
  },
  {
    type: "action",
    title: "Notify Client",
    description: "Email the summary and next steps",
    icon: Mail,
    color: "blue",
  },
]

const initialWorkflowNodes: WorkflowNode[] = [
  {
    id: "intake",
    type: "trigger",
    title: "Document Upload",
    description: "Client uploads a contract or filing",
    icon: Upload,
    color: "emerald",
    position: { x: 50, y: 100 },
  },
  {
    id: "extract",
    type: "action",
    title: "Extract Clauses",
    description: "Parse the document into structured clauses",
    icon: ScanText,
    color: "blue",
    position: { x: 300, y: 100 },
  },
  {
    id: "risk",
    type: "condition",
    title: "Risk Check",
    description: "Flag clauses above the risk threshold",
    icon: ShieldAlert,
    color: "amber",
    position: { x: 550, y: 100 },
  },
  {
    id: "review",
    type: "action",
    title: "Draft Response",
    description: "Generate a redline or advisory memo",
    icon: FileEdit,
    color: "purple",
    position: { x: 800, y: 100 },
  },
]

const initialWorkflowConnections: WorkflowConnection[] = [
  { from: "intake", to: "extract" },
  { from: "extract", to: "risk" },
  { from: "risk", to: "review" },
]

export default function AiWorkflowPage() {
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
      <div className={cn("bg-[#F3F5F9] dark:bg-background min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0", isOpen ? "lg:ml-48" : "lg:ml-12")}>
        <div className="max-w-[1400px] w-full mx-auto px-3 sm:px-4 md:px-6 py-3 md:py-4">
          <Navbar location="AI Workflow" />

          <div className="mt-4 mb-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-accent/10">
                <FileCheck2 className="w-5 h-5 text-accent" />
              </div>
              <h1 className="font-serif text-xl sm:text-2xl font-semibold text-gray-900 dark:text-foreground">
                AI Workflow
              </h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Chain the AI tools into a repeatable pipeline — intake a document, extract
              its clauses, check risk and citations, then draft and send the response.
              Drag nodes to rearrange the flow.
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
