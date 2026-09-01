"use client";

import { motion, type PanInfo } from "framer-motion";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Crosshair,
  Database,
  Mail,
  Maximize2,
  Minus,
  Pencil,
  Plus,
  Settings,
  Spline,
  Sparkles,
  Webhook,
  Zap,
} from "lucide-react";

// Interfaces
export interface WorkflowNode {
  id: string;
  type: "trigger" | "action" | "condition";
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  position: { x: number; y: number };
}

export interface WorkflowConnection {
  from: string;
  to: string;
}

export type WorkflowNodeTemplate = Omit<WorkflowNode, "id" | "position">;

interface N8nWorkflowBlockProps {
  /** Nodes the canvas starts with. */
  nodes?: WorkflowNode[];
  /** Edges the canvas starts with. */
  connections?: WorkflowConnection[];
  /** Pool that "Add Node" draws from. */
  templates?: WorkflowNodeTemplate[];
  /** Label shown beside the status badge. */
  label?: string;
  className?: string;
  /** Fires whenever nodes or connections change, so a parent can mirror the graph. */
  onChange?: (nodes: WorkflowNode[], connections: WorkflowConnection[]) => void;
}

// Constants
const NODE_WIDTH = 200;
const NODE_HEIGHT = 100;

const nodeTemplates: WorkflowNodeTemplate[] = [
  {
    type: "trigger",
    title: "Webhook",
    description: "Receive data from external service",
    icon: Webhook,
    color: "emerald",
  },
  {
    type: "action",
    title: "Database Query",
    description: "Fetch user records",
    icon: Database,
    color: "blue",
  },
  {
    type: "condition",
    title: "Condition",
    description: "Check user status",
    icon: Settings,
    color: "amber",
  },
  {
    type: "action",
    title: "Send Email",
    description: "Notify user",
    icon: Mail,
    color: "purple",
  },
  {
    type: "action",
    title: "Log Event",
    description: "Record activity",
    icon: Zap,
    color: "indigo",
  },
];

const initialNodes: WorkflowNode[] = [
  {
    id: "node-1",
    type: "trigger",
    title: "Webhook",
    description: "Receive data from external service",
    icon: Webhook,
    color: "emerald",
    position: { x: 50, y: 100 },
  },
  {
    id: "node-2",
    type: "action",
    title: "Database Query",
    description: "Fetch user records",
    icon: Database,
    color: "blue",
    position: { x: 300, y: 100 },
  },
  {
    id: "node-3",
    type: "condition",
    title: "Condition",
    description: "Check user status",
    icon: Settings,
    color: "amber",
    position: { x: 550, y: 100 },
  },
];

const initialConnections: WorkflowConnection[] = [
  { from: "node-1", to: "node-2" },
  { from: "node-2", to: "node-3" },
];

export const colorClasses: Record<string, string> = {
  emerald: "border-emerald-400/40 bg-emerald-400/10 text-emerald-400",
  blue: "border-blue-400/40 bg-blue-400/10 text-blue-400",
  amber: "border-amber-400/40 bg-amber-400/10 text-amber-400",
  purple: "border-purple-400/40 bg-purple-400/10 text-purple-400",
  indigo: "border-indigo-400/40 bg-indigo-400/10 text-indigo-400",
};

/** Leaves whichever side of the node faces the target, so backwards links loop out cleanly. */
function wirePath(
  from: WorkflowNode,
  to: { x: number; y: number },
  forward: boolean
) {
  const startX = from.position.x + (forward ? NODE_WIDTH : 0);
  const startY = from.position.y + NODE_HEIGHT / 2;
  // how far the target sits in the direction the wire leaves; negative means it
  // doubles back, which needs a fixed bow instead of a proportional one
  const reach = forward ? to.x - startX : startX - to.x;
  const bend =
    reach > 0 ? Math.min(reach * 0.5, 150) : Math.max(80, -reach * 0.4);
  const c1 = forward ? startX + bend : startX - bend;
  const c2 = forward ? to.x - bend : to.x + bend;
  return `M${startX},${startY} C${c1},${startY} ${c2},${to.y} ${to.x},${to.y}`;
}

/**
 * framer-motion binds drag with a native listener on the node, so React's
 * stopPropagation fires too late to keep controls inside a node from dragging it.
 */
function useBlockDrag(onDown: (e: PointerEvent) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(onDown);
  latest.current = onDown;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const down = (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      latest.current(e);
    };
    el.addEventListener("pointerdown", down);
    return () => el.removeEventListener("pointerdown", down);
  }, []);

  return ref;
}

function Handle({
  side,
  armed,
  isSource,
  onDown,
}: {
  side: "left" | "right";
  armed: boolean;
  isSource: boolean;
  onDown: (e: PointerEvent) => void;
}) {
  const ref = useBlockDrag(onDown);

  return (
    <div
      ref={ref}
      className={`group/handle absolute z-30 flex h-6 w-6 -translate-y-1/2 cursor-crosshair items-center justify-center ${side === "left" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"}`}
      style={{ top: NODE_HEIGHT / 2 }}
    >
      <span
        className={`rounded-full border-2 border-background transition-all group-hover/handle:h-4 group-hover/handle:w-4 group-hover/handle:bg-primary ${
          isSource
            ? "h-4 w-4 bg-primary ring-2 ring-primary/40"
            : armed
              ? "h-4 w-4 bg-primary/60"
              : "h-3 w-3 bg-foreground/40"
        }`}
      />
    </div>
  );
}

function EditButton({ onDown }: { onDown: () => void }) {
  const ref = useBlockDrag(onDown);

  return (
    <div
      ref={ref}
      role="button"
      aria-label="Edit node"
      className="absolute right-1.5 top-1.5 z-30 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-foreground/40 opacity-0 transition-all hover:bg-foreground/10 hover:text-foreground group-hover/node:opacity-100"
    >
      <Pencil className="h-3 w-3" />
    </div>
  );
}

// Main Component
export function N8nWorkflowBlock({
  nodes: nodesProp = initialNodes,
  connections: connectionsProp = initialConnections,
  templates = nodeTemplates,
  label = "Workflow Builder",
  className = "",
  onChange,
}: N8nWorkflowBlockProps = {}) {
  const [nodes, setNodes] = useState<WorkflowNode[]>(nodesProp);
  const [connections, setConnections] =
    useState<WorkflowConnection[]>(connectionsProp);

  // Mirror every graph change upward; a ref keeps the effect from re-running
  // just because the parent passed a new callback identity.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current?.(nodes, connections);
  }, [nodes, connections]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStartPosition = useRef<{ x: number; y: number } | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<
    (WorkflowNodeTemplate & { id: string | null }) | null
  >(null);
  const [contentSize, setContentSize] = useState(() => {
    const maxX = Math.max(...nodesProp.map((n) => n.position.x + NODE_WIDTH), 0);
    const maxY = Math.max(
      ...nodesProp.map((n) => n.position.y + NODE_HEIGHT),
      0
    );
    return { width: maxX + 50, height: maxY + 50 };
  });

  // the native wheel listener below is attached once, so it reads scale from a ref
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const getCanvasPoint = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left + canvas.scrollLeft) / scaleRef.current,
        y: (e.clientY - rect.top + canvas.scrollTop) / scaleRef.current,
      };
    },
    []
  );

  /** Zooms about a canvas-local anchor so the point under it stays put. */
  const zoomTo = useCallback((next: number, anchor?: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const clamped = Math.min(2, Math.max(0.25, next));
    const at = anchor ?? {
      x: canvas.clientWidth / 2,
      y: canvas.clientHeight / 2,
    };
    const contentX = (canvas.scrollLeft + at.x) / scaleRef.current;
    const contentY = (canvas.scrollTop + at.y) / scaleRef.current;

    flushSync(() => setScale(clamped));

    canvas.scrollLeft = contentX * clamped - at.x;
    canvas.scrollTop = contentY * clamped - at.y;
  }, []);

  // ctrl/cmd + wheel zooms; plain wheel keeps scrolling the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomTo(scaleRef.current * (e.deltaY < 0 ? 1.12 : 1 / 1.12), {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, [zoomTo]);

  const focusNode = (node: WorkflowNode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.scrollTo({
      left:
        (node.position.x + NODE_WIDTH / 2) * scale - canvas.clientWidth / 2,
      top:
        (node.position.y + NODE_HEIGHT / 2) * scale - canvas.clientHeight / 2,
      behavior: "smooth",
    });
    setFocusedId(node.id);
    setTimeout(() => setFocusedId(null), 1500);
  };

  const fitView = () => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;
    const minX = Math.min(...nodes.map((n) => n.position.x));
    const minY = Math.min(...nodes.map((n) => n.position.y));
    const maxX = Math.max(...nodes.map((n) => n.position.x + NODE_WIDTH));
    const maxY = Math.max(...nodes.map((n) => n.position.y + NODE_HEIGHT));
    const next = Math.min(
      1,
      Math.max(
        0.25,
        Math.min(
          canvas.clientWidth / (maxX - minX + 80),
          canvas.clientHeight / (maxY - minY + 80)
        )
      )
    );

    flushSync(() => setScale(next));

    canvas.scrollLeft = minX * next - 40;
    canvas.scrollTop = minY * next - 40;
  };

  // While a wire is in flight it trails the cursor; Escape drops it.
  useEffect(() => {
    if (!connectingFrom) return;
    const move = (e: PointerEvent) => setPointer(getCanvasPoint(e));
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConnectingFrom(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("keydown", key);
    };
  }, [connectingFrom, getCanvasPoint]);

  // Drag Handlers
  const handleDragStart = (nodeId: string) => {
    setDraggingNodeId(nodeId);
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      dragStartPosition.current = { x: node.position.x, y: node.position.y };
    }
  };

  const handleDrag = (nodeId: string, { offset }: PanInfo) => {
    if (draggingNodeId !== nodeId || !dragStartPosition.current) return;

    // offset is in screen pixels, positions are in canvas units
    const newX = dragStartPosition.current.x + offset.x / scale;
    const newY = dragStartPosition.current.y + offset.y / scale;

    const constrainedX = Math.max(0, newX);
    const constrainedY = Math.max(0, newY);

    flushSync(() => {
      setNodes((prev) =>
        prev.map((node) =>
          node.id === nodeId
            ? { ...node, position: { x: constrainedX, y: constrainedY } }
            : node
        )
      );
    });

    setContentSize((prev) => ({
      width: Math.max(prev.width, constrainedX + NODE_WIDTH + 50),
      height: Math.max(prev.height, constrainedY + NODE_HEIGHT + 50),
    }));
  };

  const handleDragEnd = () => {
    setDraggingNodeId(null);
    dragStartPosition.current = null;
  };

  const handleDotDown = (nodeId: string) => (e: PointerEvent) => {
    setPointer(getCanvasPoint(e));

    if (!connectingFrom) {
      setConnectingFrom(nodeId);
      return;
    }
    if (connectingFrom !== nodeId) {
      setConnections((prev) =>
        prev.some((c) => c.from === connectingFrom && c.to === nodeId)
          ? prev
          : [...prev, { from: connectingFrom, to: nodeId }]
      );
    }
    setConnectingFrom(null);
  };

  // Add Node Handler
  const addNode = (template: WorkflowNodeTemplate) => {
    const lastNode = nodes[nodes.length - 1];
    const newPosition = lastNode
      ? { x: lastNode.position.x + 250, y: lastNode.position.y }
      : { x: 50, y: 100 };

    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      ...template,
      position: newPosition,
    };

    flushSync(() => {
      setNodes((prev) => [...prev, newNode]);
      setContentSize((prev) => ({
        width: Math.max(prev.width, newPosition.x + NODE_WIDTH + 50),
        height: Math.max(prev.height, newPosition.y + NODE_HEIGHT + 50),
      }));
    });

    focusNode(newNode);
  };

  const saveDraft = () => {
    if (!draft || !draft.title.trim()) return;
    const { id, ...fields } = draft;

    if (id) {
      setNodes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, ...fields } : n))
      );
    } else {
      addNode(fields);
    }
    setDraft(null);
  };

  const sourceNode = connectingFrom
    ? nodes.find((n) => n.id === connectingFrom)
    : undefined;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border border-border/40 bg-background/60 backdrop-blur p-4 sm:p-6 ${className}`}
    >
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className="rounded-full border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-400"
          >
            Active
          </Badge>
          <span className="text-xs sm:text-sm uppercase tracking-[0.25em] text-foreground/50">
            {label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Node finder — jump back to a node when the canvas gets away from you */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={nodes.length === 0}
                className="h-8 w-8 rounded-lg p-0 text-foreground/70 hover:text-foreground"
                aria-label="Find a node"
              >
                <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 w-56">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.15em] text-foreground/50">
                Jump to node
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {nodes.map((node) => {
                const Icon = node.icon;
                return (
                  <DropdownMenuItem
                    key={node.id}
                    onSelect={() => focusNode(node)}
                    className="gap-2"
                  >
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${colorClasses[node.color]}`}
                    >
                      <Icon className="h-3 w-3" />
                    </div>
                    <span className="truncate text-xs">{node.title}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            onClick={fitView}
            className="h-8 w-8 rounded-lg p-0 text-foreground/70 hover:text-foreground"
            aria-label="Fit all nodes in view"
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>

          <div className="flex items-center rounded-lg border border-border/60">
            <button
              type="button"
              onClick={() => zoomTo(scale / 1.2)}
              className="flex h-8 w-7 items-center justify-center rounded-l-lg text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
              aria-label="Zoom out"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => zoomTo(1)}
              className="w-11 text-center text-[11px] tabular-nums text-foreground/60 transition-colors hover:text-foreground"
              aria-label="Reset zoom to 100%"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              type="button"
              onClick={() => zoomTo(scale * 1.2)}
              className="flex h-8 w-7 items-center justify-center rounded-r-lg text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
              aria-label="Zoom in"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2 rounded-lg text-xs uppercase tracking-[0.2em] text-foreground/70 hover:text-foreground"
                aria-label="Add new node"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Add Node</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem
                onSelect={() =>
                  setDraft({
                    id: null,
                    type: "action",
                    title: "",
                    description: "",
                    icon: Sparkles,
                    color: "indigo",
                  })
                }
                className="gap-2"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed border-border">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium">
                    Custom step…
                  </div>
                  <div className="truncate text-[10px] text-foreground/50">
                    Write your own title and description
                  </div>
                </div>
              </DropdownMenuItem>
              {templates.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.15em] text-foreground/50">
                    Presets
                  </DropdownMenuLabel>
                  {templates.map((template, i) => {
                    const Icon = template.icon;
                    return (
                      <DropdownMenuItem
                        key={`${template.title}-${i}`}
                        onSelect={() => addNode(template)}
                        className="gap-2"
                      >
                        <div
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${colorClasses[template.color]}`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium">
                            {template.title}
                          </div>
                          <div className="truncate text-[10px] text-foreground/50">
                            {template.description}
                          </div>
                        </div>
                      </DropdownMenuItem>
                    );
                  })}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        onPointerDown={() => setConnectingFrom(null)}
        className={`relative h-[400px] w-full overflow-auto rounded-xl border bg-background/40 sm:h-[500px] md:h-[600px] ${connectingFrom ? "border-primary/50" : "border-border/30"}`}
        style={{ minHeight: "400px" }}
        role="region"
        aria-label="Workflow canvas"
        tabIndex={0}
      >
        {/* Sizer holds the scaled footprint so the scrollbars stay honest */}
        <div
          style={{
            width: contentSize.width * scale,
            height: contentSize.height * scale,
          }}
        >
        {/* Content Wrapper */}
        <div
          className="relative"
          style={{
            width: contentSize.width,
            height: contentSize.height,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          {/* SVG Connections */}
          <svg
            className="absolute top-0 left-0 pointer-events-none"
            width={contentSize.width}
            height={contentSize.height}
            style={{ overflow: "visible" }}
            aria-hidden="true"
          >
            {connections.map((c) => {
              const from = nodes.find((n) => n.id === c.from);
              const to = nodes.find((n) => n.id === c.to);
              if (!from || !to) return null;

              const forward = to.position.x >= from.position.x;
              const d = wirePath(
                from,
                {
                  x: to.position.x + (forward ? 0 : NODE_WIDTH),
                  y: to.position.y + NODE_HEIGHT / 2,
                },
                forward
              );

              return (
                <g key={`${c.from}-${c.to}`} className="group/wire">
                  {/* fat transparent stroke so the thin dashed line is easy to hit */}
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={16}
                    className="pointer-events-auto cursor-pointer"
                    onClick={() =>
                      setConnections((prev) =>
                        prev.filter(
                          (conn) =>
                            !(conn.from === c.from && conn.to === c.to)
                        )
                      )
                    }
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeDasharray="8,6"
                    strokeLinecap="round"
                    className="pointer-events-none text-foreground opacity-30 transition-all group-hover/wire:text-red-500 group-hover/wire:opacity-100"
                  />
                </g>
              );
            })}
            {sourceNode && (
              <path
                d={wirePath(
                  sourceNode,
                  pointer,
                  pointer.x >= sourceNode.position.x + NODE_WIDTH / 2
                )}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeDasharray="4,4"
                strokeLinecap="round"
                className="text-primary"
                opacity={0.85}
              />
            )}
          </svg>

          {/* Nodes */}
          {nodes.map((node) => {
            const Icon = node.icon;
            const isDragging = draggingNodeId === node.id;
            const linkCount = connections.filter(
              (c) => c.from === node.id || c.to === node.id
            ).length;

            return (
              <motion.div
                key={node.id}
                drag
                dragMomentum={false}
                dragConstraints={{
                  left: 0,
                  top: 0,
                  right: 100000,
                  bottom: 100000,
                }}
                onDragStart={() => handleDragStart(node.id)}
                onDrag={(_, info) => handleDrag(node.id, info)}
                onDragEnd={handleDragEnd}
                style={{
                  x: node.position.x,
                  y: node.position.y,
                  width: NODE_WIDTH,
                  transformOrigin: "0 0",
                }}
                className="absolute cursor-grab"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2 }}
                whileHover={{ scale: 1.02 }}
                whileDrag={{ scale: 1.05, zIndex: 50, cursor: "grabbing" }}
                aria-grabbed={isDragging}
              >
                <Card
                  className={`group/node relative w-full overflow-hidden rounded-xl border ${colorClasses[node.color]} bg-background/70 p-3 backdrop-blur transition-all hover:shadow-lg ${isDragging ? "shadow-xl ring-2 ring-primary/50" : ""} ${connectingFrom === node.id ? "ring-2 ring-primary" : ""} ${focusedId === node.id ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
                  role="article"
                  aria-label={`${node.type} node: ${node.title}`}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-foreground/[0.04] via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover/node:opacity-100" />

                  <EditButton
                    onDown={() =>
                      setDraft({
                        id: node.id,
                        type: node.type,
                        title: node.title,
                        description: node.description,
                        icon: node.icon,
                        color: node.color,
                      })
                    }
                  />

                  <div className="relative space-y-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${colorClasses[node.color]} bg-background/80 backdrop-blur`}
                        aria-hidden="true"
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <Badge
                          variant="outline"
                          className="mb-0.5 rounded-full border-border/40 bg-background/80 px-1.5 py-0 text-[9px] uppercase tracking-[0.15em] text-foreground/60"
                        >
                          {node.type}
                        </Badge>
                        <h3 className="truncate text-xs font-semibold tracking-tight text-foreground">
                          {node.title}
                        </h3>
                      </div>
                    </div>
                    <p className="line-clamp-2 text-[10px] leading-relaxed text-foreground/70">
                      {node.description}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-foreground/50">
                      <Spline className="h-2.5 w-2.5" aria-hidden="true" />
                      <span className="uppercase tracking-[0.1em]">
                        {linkCount} {linkCount === 1 ? "link" : "links"}
                      </span>
                    </div>
                  </div>
                </Card>

                <Handle
                  side="left"
                  armed={!!connectingFrom && connectingFrom !== node.id}
                  isSource={connectingFrom === node.id}
                  onDown={handleDotDown(node.id)}
                />
                <Handle
                  side="right"
                  armed={!!connectingFrom && connectingFrom !== node.id}
                  isSource={connectingFrom === node.id}
                  onDown={handleDotDown(node.id)}
                />
              </motion.div>
            );
          })}
        </div>
        </div>
      </div>

      {/* Footer Stats */}
      <div
        className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/30 bg-background/40 px-4 py-2.5 backdrop-blur-sm"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center gap-4 text-xs text-foreground/60">
          <div className="flex items-center gap-2">
            <div
              className="h-1.5 w-1.5 rounded-full bg-emerald-500"
              aria-hidden="true"
            />
            <span className="uppercase tracking-[0.15em]">
              {nodes.length} {nodes.length === 1 ? "Node" : "Nodes"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="h-1.5 w-1.5 rounded-full bg-primary"
              aria-hidden="true"
            />
            <span className="uppercase tracking-[0.15em]">
              {connections.length}{" "}
              {connections.length === 1 ? "Connection" : "Connections"}
            </span>
          </div>
        </div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-foreground/40">
          {connectingFrom
            ? "Click another node's dot to link · Esc to cancel"
            : "Ctrl + scroll to zoom · click a dot to wire · click a wire to break"}
        </p>
      </div>

      <Dialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {draft?.id ? "Edit node" : "Custom node"}
            </DialogTitle>
          </DialogHeader>

          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="wf-title" className="text-xs">
                  Title
                </Label>
                <Input
                  id="wf-title"
                  value={draft.title}
                  autoFocus
                  placeholder="e.g. Check Limitation Period"
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                  onKeyDown={(e) => e.key === "Enter" && saveDraft()}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wf-description" className="text-xs">
                  Description
                </Label>
                <Textarea
                  id="wf-description"
                  rows={2}
                  value={draft.description}
                  placeholder="What this step does"
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <div className="flex gap-2">
                  {(["trigger", "action", "condition"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setDraft({ ...draft, type })}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] capitalize transition-colors ${
                        draft.type === type
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-foreground/60 hover:bg-foreground/5"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Color</Label>
                <div className="flex gap-2">
                  {Object.keys(colorClasses).map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setDraft({ ...draft, color })}
                      aria-label={color}
                      className={`h-7 w-7 rounded-full border-2 transition-transform ${colorClasses[color]} ${
                        draft.color === color
                          ? "scale-110 ring-2 ring-foreground/40"
                          : "hover:scale-105"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={saveDraft}
              disabled={!draft?.title.trim()}
            >
              {draft?.id ? "Save" : "Add node"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
