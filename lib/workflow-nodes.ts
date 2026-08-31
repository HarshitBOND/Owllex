import {
  FileEdit,
  Gavel,
  Mail,
  Quote,
  ScanText,
  ShieldAlert,
  Upload,
} from "lucide-react"
import type {
  WorkflowConnection,
  WorkflowNode,
  WorkflowNodeTemplate,
} from "@/components/ui/n8n-workflow-block-shadcnui"

/** Steps the "Add Node" button draws from. */
export const legalNodeTemplates: WorkflowNodeTemplate[] = [
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

export const initialWorkflowNodes: WorkflowNode[] = [
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

export const initialWorkflowConnections: WorkflowConnection[] = [
  { from: "intake", to: "extract" },
  { from: "extract", to: "risk" },
  { from: "risk", to: "review" },
]
