import type { WorkflowConnection, WorkflowNode } from "@/components/ui/n8n-workflow-block-shadcnui"
import { WORKFLOW_ICON_MAP, iconKeyFor, type WorkflowIconKey } from "@/lib/workflow-icon-registry"

/**
 * Moving a workflow between the canvas and everything outside it.
 *
 * The canvas holds an icon *component* and a laid-out position on every node;
 * the chat tool and the database both speak in icon *keys* and no positions at
 * all. These two functions are the only place that difference is handled, so
 * the AI panel and the corpus store cannot disagree about it.
 */

const NODE_WIDTH = 200
const NODE_GAP = 50

export type SerializedWorkflowNode = {
  id: string
  type: "trigger" | "action" | "condition"
  title: string
  description: string
  icon: string
  color: string
}

/** Canvas nodes -> the plain shape the API and the model use. */
export function serializeNodes(nodes: WorkflowNode[]): SerializedWorkflowNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    title: node.title,
    description: node.description,
    icon: iconKeyFor(node.icon),
    color: node.color,
  }))
}

/**
 * Plain nodes -> canvas nodes, laid out as one left-to-right chain.
 *
 * Positions are recomputed rather than stored: a saved coordinate goes stale
 * the moment a step is inserted, and the chain reads better laid out fresh.
 */
export function layoutNodes(nodes: SerializedWorkflowNode[]): WorkflowNode[] {
  return nodes.map((node, index) => ({
    id: node.id,
    type: node.type,
    title: node.title,
    description: node.description,
    icon: WORKFLOW_ICON_MAP[node.icon as WorkflowIconKey] ?? WORKFLOW_ICON_MAP.sparkles,
    color: node.color,
    position: { x: index * (NODE_WIDTH + NODE_GAP), y: 100 },
  }))
}

export type { WorkflowConnection, WorkflowNode }
