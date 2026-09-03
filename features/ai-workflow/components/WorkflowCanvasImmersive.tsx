"use client"

import type React from "react"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { motion, type PanInfo } from "framer-motion"
import { flushSync } from "react-dom"
import {
  Expand,
  Grid3x3,
  Pencil,
  Play,
  Sparkles,
  Spline,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type {
  WorkflowConnection,
  WorkflowNode,
  WorkflowNodeTemplate,
} from "@/components/ui/n8n-workflow-block-shadcnui"

const NODE_WIDTH = 208
const NODE_HEIGHT = 108

const iconTint: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  purple: "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400",
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
}

const dotTint: Record<string, string> = {
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  purple: "bg-purple-500",
  indigo: "bg-indigo-500",
}

const ringTint: Record<string, string> = {
  emerald: "ring-emerald-400",
  blue: "ring-blue-400",
  amber: "ring-amber-400",
  purple: "ring-purple-400",
  indigo: "ring-indigo-400",
}

function wirePath(from: WorkflowNode, to: { x: number; y: number }, forward: boolean) {
  const startX = from.position.x + (forward ? NODE_WIDTH : 0)
  const startY = from.position.y + NODE_HEIGHT / 2
  const reach = forward ? to.x - startX : startX - to.x
  const bend = reach > 0 ? Math.min(reach * 0.5, 150) : Math.max(80, -reach * 0.4)
  const c1 = forward ? startX + bend : startX - bend
  const c2 = forward ? to.x - bend : to.x + bend
  return { d: `M${startX},${startY} C${c1},${startY} ${c2},${to.y} ${to.x},${to.y}`, startX, startY }
}

/** framer-motion binds drag natively, so React's stopPropagation fires too late for controls inside a node. */
function useBlockDrag(onDown: (e: PointerEvent) => void) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef(onDown)
  latest.current = onDown

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const down = (e: PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()
      latest.current(e)
    }
    el.addEventListener("pointerdown", down)
    return () => el.removeEventListener("pointerdown", down)
  }, [])

  return ref
}

function Handle({
  side,
  armed,
  isSource,
  onDown,
}: {
  side: "left" | "right"
  armed: boolean
  isSource: boolean
  onDown: (e: PointerEvent) => void
}) {
  const ref = useBlockDrag(onDown)
  return (
    <div
      ref={ref}
      className={cn(
        "group/handle absolute z-30 flex h-5 w-5 -translate-y-1/2 cursor-crosshair items-center justify-center",
        side === "left" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"
      )}
      style={{ top: NODE_HEIGHT / 2 }}
    >
      <span
        className={cn(
          "rounded-full border-2 border-white dark:border-card shadow-sm transition-all group-hover/handle:h-3.5 group-hover/handle:w-3.5 group-hover/handle:bg-accent",
          isSource ? "h-3.5 w-3.5 bg-accent ring-2 ring-accent/30" : armed ? "h-3 w-3 bg-accent/70" : "h-2.5 w-2.5 bg-gray-300 dark:bg-gray-600"
        )}
      />
    </div>
  )
}

function EditButton({ onDown }: { onDown: () => void }) {
  const ref = useBlockDrag(onDown)
  return (
    <div
      ref={ref}
      role="button"
      aria-label="Edit node"
      className="absolute right-1.5 top-1.5 z-30 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-gray-400 opacity-0 transition-all hover:bg-gray-100 dark:hover:bg-secondary hover:text-gray-600 group-hover/node:opacity-100"
    >
      <Pencil className="h-3 w-3" />
    </div>
  )
}

export interface WorkflowCanvasHandle {
  addNode: (template: WorkflowNodeTemplate) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  fitView: () => void
  runPreview: () => void
}

interface WorkflowCanvasImmersiveProps {
  nodes?: WorkflowNode[]
  connections?: WorkflowConnection[]
  onChange?: (nodes: WorkflowNode[], connections: WorkflowConnection[]) => void
  onRequestAssistant?: () => void
  onScaleChange?: (scale: number) => void
  panMode?: boolean
  className?: string
}

export const WorkflowCanvasImmersive = forwardRef<WorkflowCanvasHandle, WorkflowCanvasImmersiveProps>(
  function WorkflowCanvasImmersive(
    { nodes: nodesProp = [], connections: connectionsProp = [], onChange, onRequestAssistant, onScaleChange, panMode = false, className },
    ref
  ) {
    const [nodes, setNodes] = useState<WorkflowNode[]>(nodesProp)
    const [connections, setConnections] = useState<WorkflowConnection[]>(connectionsProp)
    const [showGrid, setShowGrid] = useState(true)
    const [runningId, setRunningId] = useState<string | null>(null)

    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    useEffect(() => {
      onChangeRef.current?.(nodes, connections)
    }, [nodes, connections])

    const canvasRef = useRef<HTMLDivElement>(null)
    const dragStartPosition = useRef<{ x: number; y: number } | null>(null)
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
    const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
    const [pointer, setPointer] = useState({ x: 0, y: 0 })
    const [scale, setScale] = useState(1)
    const [focusedId, setFocusedId] = useState<string | null>(null)
    const [draft, setDraft] = useState<(WorkflowNodeTemplate & { id: string | null }) | null>(null)
    const [viewport, setViewport] = useState({ left: 0, top: 0, w: 1, h: 1 })
    const [contentSize, setContentSize] = useState(() => {
      const maxX = Math.max(...nodesProp.map((n) => n.position.x + NODE_WIDTH), 0)
      const maxY = Math.max(...nodesProp.map((n) => n.position.y + NODE_HEIGHT), 0)
      return { width: maxX + 80, height: maxY + 80 }
    })

    const scaleRef = useRef(scale)
    scaleRef.current = scale

    const onScaleChangeRef = useRef(onScaleChange)
    onScaleChangeRef.current = onScaleChange
    useEffect(() => {
      onScaleChangeRef.current?.(scale)
    }, [scale])

    const getCanvasPoint = useCallback((e: { clientX: number; clientY: number }) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      return {
        x: (e.clientX - rect.left + canvas.scrollLeft) / scaleRef.current,
        y: (e.clientY - rect.top + canvas.scrollTop) / scaleRef.current,
      }
    }, [])

    const updateViewport = useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      setContentSize((prev) => {
        setViewport({
          left: canvas.scrollLeft / scaleRef.current / prev.width,
          top: canvas.scrollTop / scaleRef.current / prev.height,
          w: canvas.clientWidth / scaleRef.current / prev.width,
          h: canvas.clientHeight / scaleRef.current / prev.height,
        })
        return prev
      })
    }, [])

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      updateViewport()
      canvas.addEventListener("scroll", updateViewport)
      const ro = new ResizeObserver(updateViewport)
      ro.observe(canvas)
      return () => {
        canvas.removeEventListener("scroll", updateViewport)
        ro.disconnect()
      }
    }, [updateViewport])

    const zoomTo = useCallback((next: number, anchor?: { x: number; y: number }) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const clamped = Math.min(2, Math.max(0.25, next))
      const at = anchor ?? { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }
      const contentX = (canvas.scrollLeft + at.x) / scaleRef.current
      const contentY = (canvas.scrollTop + at.y) / scaleRef.current

      flushSync(() => setScale(clamped))

      canvas.scrollLeft = contentX * clamped - at.x
      canvas.scrollTop = contentY * clamped - at.y
      updateViewport()
    }, [updateViewport])

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const wheel = (e: WheelEvent) => {
        if (!e.ctrlKey && !e.metaKey) return
        e.preventDefault()
        const rect = canvas.getBoundingClientRect()
        zoomTo(scaleRef.current * (e.deltaY < 0 ? 1.12 : 1 / 1.12), {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        })
      }
      canvas.addEventListener("wheel", wheel, { passive: false })
      return () => canvas.removeEventListener("wheel", wheel)
    }, [zoomTo])

    // Hand-tool panning: drag anywhere on empty canvas to scroll it.
    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas || !panMode) return
      let panning = false
      let last = { x: 0, y: 0 }
      const down = (e: PointerEvent) => {
        if ((e.target as HTMLElement).closest("[data-node]")) return
        panning = true
        last = { x: e.clientX, y: e.clientY }
        canvas.setPointerCapture(e.pointerId)
      }
      const move = (e: PointerEvent) => {
        if (!panning) return
        canvas.scrollLeft -= e.clientX - last.x
        canvas.scrollTop -= e.clientY - last.y
        last = { x: e.clientX, y: e.clientY }
      }
      const up = () => {
        panning = false
      }
      canvas.addEventListener("pointerdown", down)
      canvas.addEventListener("pointermove", move)
      canvas.addEventListener("pointerup", up)
      canvas.addEventListener("pointercancel", up)
      return () => {
        canvas.removeEventListener("pointerdown", down)
        canvas.removeEventListener("pointermove", move)
        canvas.removeEventListener("pointerup", up)
        canvas.removeEventListener("pointercancel", up)
      }
    }, [panMode])

    const focusNode = useCallback(
      (node: WorkflowNode) => {
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.scrollTo({
          left: (node.position.x + NODE_WIDTH / 2) * scaleRef.current - canvas.clientWidth / 2,
          top: (node.position.y + NODE_HEIGHT / 2) * scaleRef.current - canvas.clientHeight / 2,
          behavior: "smooth",
        })
        setFocusedId(node.id)
        setTimeout(() => setFocusedId(null), 1500)
      },
      []
    )

    const fitView = useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas || nodes.length === 0) return
      const minX = Math.min(...nodes.map((n) => n.position.x))
      const minY = Math.min(...nodes.map((n) => n.position.y))
      const maxX = Math.max(...nodes.map((n) => n.position.x + NODE_WIDTH))
      const maxY = Math.max(...nodes.map((n) => n.position.y + NODE_HEIGHT))
      const next = Math.min(
        1,
        Math.max(0.25, Math.min(canvas.clientWidth / (maxX - minX + 80), canvas.clientHeight / (maxY - minY + 80)))
      )

      flushSync(() => setScale(next))

      canvas.scrollLeft = minX * next - 40
      canvas.scrollTop = minY * next - 40
      updateViewport()
    }, [nodes, updateViewport])

    useEffect(() => {
      if (!connectingFrom) return
      const move = (e: PointerEvent) => setPointer(getCanvasPoint(e))
      const key = (e: KeyboardEvent) => {
        if (e.key === "Escape") setConnectingFrom(null)
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("keydown", key)
      return () => {
        window.removeEventListener("pointermove", move)
        window.removeEventListener("keydown", key)
      }
    }, [connectingFrom, getCanvasPoint])

    const handleDragStart = (nodeId: string) => {
      setDraggingNodeId(nodeId)
      const node = nodes.find((n) => n.id === nodeId)
      if (node) dragStartPosition.current = { x: node.position.x, y: node.position.y }
    }

    const handleDrag = (nodeId: string, { offset }: PanInfo) => {
      if (draggingNodeId !== nodeId || !dragStartPosition.current) return
      const newX = Math.max(0, dragStartPosition.current.x + offset.x / scale)
      const newY = Math.max(0, dragStartPosition.current.y + offset.y / scale)

      flushSync(() => {
        setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, position: { x: newX, y: newY } } : n)))
      })
      setContentSize((prev) => ({
        width: Math.max(prev.width, newX + NODE_WIDTH + 80),
        height: Math.max(prev.height, newY + NODE_HEIGHT + 80),
      }))
    }

    const handleDragEnd = () => {
      setDraggingNodeId(null)
      dragStartPosition.current = null
    }

    const handleDotDown = (nodeId: string) => (e: PointerEvent) => {
      setPointer(getCanvasPoint(e))
      if (!connectingFrom) {
        setConnectingFrom(nodeId)
        return
      }
      if (connectingFrom !== nodeId) {
        setConnections((prev) =>
          prev.some((c) => c.from === connectingFrom && c.to === nodeId) ? prev : [...prev, { from: connectingFrom, to: nodeId }]
        )
      }
      setConnectingFrom(null)
    }

    const addNode = useCallback(
      (template: WorkflowNodeTemplate) => {
        setNodes((prev) => {
          const lastNode = prev[prev.length - 1]
          const newPosition = lastNode ? { x: lastNode.position.x + 258, y: lastNode.position.y } : { x: 40, y: 100 }
          const newNode: WorkflowNode = { id: `node-${Date.now()}`, ...template, position: newPosition }
          setContentSize((c) => ({
            width: Math.max(c.width, newPosition.x + NODE_WIDTH + 80),
            height: Math.max(c.height, newPosition.y + NODE_HEIGHT + 80),
          }))
          setConnections((conns) => (lastNode ? [...conns, { from: lastNode.id, to: newNode.id }] : conns))
          setTimeout(() => focusNode(newNode), 0)
          return [...prev, newNode]
        })
      },
      [focusNode]
    )

    const runPreview = useCallback(() => {
      if (nodes.length === 0) return
      const order = [nodes[0].id, ...connections.map((c) => c.to)]
      let i = 0
      const step = () => {
        if (i >= order.length) {
          setRunningId(null)
          return
        }
        setRunningId(order[i])
        i += 1
        setTimeout(step, 420)
      }
      step()
    }, [nodes, connections])

    useImperativeHandle(
      ref,
      () => ({
        addNode,
        zoomIn: () => zoomTo(scaleRef.current * 1.2),
        zoomOut: () => zoomTo(scaleRef.current / 1.2),
        resetZoom: () => zoomTo(1),
        fitView,
        runPreview,
      }),
      [addNode, zoomTo, fitView, runPreview]
    )

    const saveDraft = () => {
      if (!draft || !draft.title.trim()) return
      const { id, ...fields } = draft
      if (id) {
        setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...fields } : n)))
      } else {
        addNode(fields)
      }
      setDraft(null)
    }

    const sourceNode = connectingFrom ? nodes.find((n) => n.id === connectingFrom) : undefined

    return (
      <div className={cn("relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 dark:border-border bg-white dark:bg-card", className)}>
        <div className="relative flex-1 min-h-0">
        <div
          ref={canvasRef}
          onPointerDown={() => setConnectingFrom(null)}
          className={cn(
            "absolute inset-0 overflow-auto overscroll-contain bg-[#fafafa] dark:bg-[#131417] text-black/15 dark:text-white/15",
            panMode ? "cursor-grab active:cursor-grabbing" : "",
            connectingFrom && "outline outline-2 outline-accent/30 -outline-offset-2"
          )}
          style={{
            touchAction: "pan-x pan-y",
            backgroundImage: showGrid ? "radial-gradient(currentColor 1.5px, transparent 1.5px)" : undefined,
            backgroundSize: showGrid ? `${18 * scale}px ${18 * scale}px` : undefined,
          }}
          role="region"
          aria-label="Workflow canvas"
          tabIndex={0}
        >
          <div style={{ width: contentSize.width * scale, height: contentSize.height * scale }}>
            <div
              className="relative"
              style={{ width: contentSize.width, height: contentSize.height, transform: `scale(${scale})`, transformOrigin: "0 0" }}
            >
              <svg
                className="absolute top-0 left-0 pointer-events-none"
                width={contentSize.width}
                height={contentSize.height}
                style={{ overflow: "visible" }}
                aria-hidden="true"
              >
                {connections.map((c) => {
                  const from = nodes.find((n) => n.id === c.from)
                  const to = nodes.find((n) => n.id === c.to)
                  if (!from || !to) return null
                  const forward = to.position.x >= from.position.x
                  const target = { x: to.position.x + (forward ? 0 : NODE_WIDTH), y: to.position.y + NODE_HEIGHT / 2 }
                  const { d, startX, startY } = wirePath(from, target, forward)
                  const midX = (startX + target.x) / 2
                  const midY = (startY + target.y) / 2

                  return (
                    <g key={`${c.from}-${c.to}`} className="group/wire">
                      <path
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={16}
                        className="pointer-events-auto cursor-pointer"
                        onClick={() =>
                          setConnections((prev) => prev.filter((conn) => !(conn.from === c.from && conn.to === c.to)))
                        }
                      />
                      <path
                        d={d}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.75}
                        strokeDasharray="6,5"
                        strokeLinecap="round"
                        className="pointer-events-none text-gray-300 dark:text-border transition-colors group-hover/wire:text-red-400"
                      />
                      <circle cx={midX} cy={midY} r={3.5} className="fill-gray-300 dark:fill-border pointer-events-none" />
                    </g>
                  )
                })}
                {sourceNode && (
                  <path
                    d={wirePath(sourceNode, pointer, pointer.x >= sourceNode.position.x + NODE_WIDTH / 2).d}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeDasharray="4,4"
                    strokeLinecap="round"
                    className="text-accent"
                    opacity={0.85}
                  />
                )}
              </svg>

              {nodes.map((node) => {
                const Icon = node.icon
                const isDragging = draggingNodeId === node.id
                const linkCount = connections.filter((c) => c.from === node.id || c.to === node.id).length
                const isRunning = runningId === node.id

                return (
                  <motion.div
                    key={node.id}
                    data-node
                    drag
                    dragMomentum={false}
                    dragConstraints={{ left: 0, top: 0, right: 100000, bottom: 100000 }}
                    onDragStart={() => handleDragStart(node.id)}
                    onDrag={(_, info) => handleDrag(node.id, info)}
                    onDragEnd={handleDragEnd}
                    style={{ x: node.position.x, y: node.position.y, width: NODE_WIDTH, transformOrigin: "0 0" }}
                    className="absolute cursor-grab"
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.18 }}
                    whileDrag={{ scale: 1.03, zIndex: 50, cursor: "grabbing" }}
                    aria-grabbed={isDragging}
                  >
                    <div
                      role="article"
                      aria-label={`${node.type} node: ${node.title}`}
                      className={cn(
                        "group/node relative w-full rounded-xl border bg-white dark:bg-card p-3.5 transition-all hover:shadow-md",
                        isDragging ? "shadow-xl border-accent/50" : "border-gray-200 dark:border-border",
                        connectingFrom === node.id && "ring-2 ring-accent",
                        focusedId === node.id && "ring-2 ring-accent ring-offset-2",
                        isRunning && `ring-2 ring-offset-2 ${ringTint[node.color] ?? "ring-accent"}`
                      )}
                    >
                      <EditButton
                        onDown={() =>
                          setDraft({ id: node.id, type: node.type, title: node.title, description: node.description, icon: node.icon, color: node.color })
                        }
                      />

                      <div className="flex items-start gap-2.5">
                        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", iconTint[node.color] ?? iconTint.indigo)}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-muted-foreground">{node.type}</p>
                          <h3 className="truncate text-[13px] font-semibold text-gray-900 dark:text-foreground leading-snug">{node.title}</h3>
                        </div>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-gray-500 dark:text-muted-foreground">{node.description}</p>
                      <div className="mt-2.5 flex items-center gap-1.5 border-t border-gray-100 dark:border-border/60 pt-2 text-[10.5px] text-gray-400 dark:text-muted-foreground">
                        <Spline className="h-2.5 w-2.5" aria-hidden="true" />
                        <span>
                          {linkCount} {linkCount === 1 ? "LINK" : "LINKS"}
                        </span>
                      </div>
                    </div>

                    <Handle side="left" armed={!!connectingFrom && connectingFrom !== node.id} isSource={connectingFrom === node.id} onDown={handleDotDown(node.id)} />
                    <Handle side="right" armed={!!connectingFrom && connectingFrom !== node.id} isSource={connectingFrom === node.id} onDown={handleDotDown(node.id)} />
                  </motion.div>
                )
              })}
            </div>
          </div>
        </div>

          {/* Floating tool rail */}
          <div className="absolute top-3 left-3 z-20 flex w-fit flex-col gap-1 rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-1 shadow-md">
            <button
              type="button"
              title="Preview run"
              onClick={runPreview}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
            >
              <Play className="h-4 w-4 fill-current" />
            </button>
            <button
              type="button"
              title="Ask AI"
              onClick={onRequestAssistant}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-accent hover:bg-accent/10 transition-colors"
            >
              <Sparkles className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Toggle grid"
              onClick={() => setShowGrid((v) => !v)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                showGrid ? "text-gray-700 dark:text-foreground bg-gray-100 dark:bg-secondary" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-secondary"
              )}
            >
              <Grid3x3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Fit to view"
              onClick={fitView}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
            >
              <Expand className="h-4 w-4" />
            </button>
          </div>

          {/* Minimap */}
          {nodes.length > 0 && (
            <div className="absolute bottom-3 left-3 z-20 h-[92px] w-[150px] rounded-lg border border-gray-200 dark:border-border bg-white/95 dark:bg-card/95 p-1.5 shadow-sm backdrop-blur">
              <div className="relative h-full w-full overflow-hidden rounded">
                {nodes.map((n) => (
                  <div
                    key={n.id}
                    className={cn("absolute rounded-[2px]", dotTint[n.color] ?? "bg-gray-400")}
                    style={{
                      left: `${(n.position.x / contentSize.width) * 100}%`,
                      top: `${(n.position.y / contentSize.height) * 100}%`,
                      width: `${Math.max((NODE_WIDTH / contentSize.width) * 100, 4)}%`,
                      height: `${Math.max((NODE_HEIGHT / contentSize.height) * 100, 8)}%`,
                    }}
                  />
                ))}
                <div
                  className="absolute rounded-[2px] border border-gray-400/70 dark:border-foreground/40"
                  style={{
                    left: `${Math.min(Math.max(viewport.left, 0), 1) * 100}%`,
                    top: `${Math.min(Math.max(viewport.top, 0), 1) * 100}%`,
                    width: `${Math.min(viewport.w, 1) * 100}%`,
                    height: `${Math.min(viewport.h, 1) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-200 dark:border-border px-4 py-2.5">
          <div className="flex items-center gap-4 text-[11px] text-gray-500 dark:text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {nodes.length} {nodes.length === 1 ? "NODE" : "NODES"}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-border" />
              {connections.length} {connections.length === 1 ? "CONNECTION" : "CONNECTIONS"}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-muted-foreground">
            {connectingFrom ? (
              "Click another node's dot to link · Esc to cancel"
            ) : (
              <>
                Drag from a connection dot to create a new link{" "}
                <button type="button" onClick={fitView} className="text-accent hover:underline font-medium">
                  Learn more ↗
                </button>
              </>
            )}
          </p>
        </div>

        <Dialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">{draft?.id ? "Edit node" : "Custom node"}</DialogTitle>
            </DialogHeader>

            {draft && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="wf-title" className="text-xs">Title</Label>
                  <Input
                    id="wf-title"
                    value={draft.title}
                    autoFocus
                    placeholder="e.g. Check Limitation Period"
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && saveDraft()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wf-description" className="text-xs">Description</Label>
                  <Textarea
                    id="wf-description"
                    rows={2}
                    value={draft.description}
                    placeholder="What this step does"
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
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
                        className={cn(
                          "flex-1 rounded-lg border px-2 py-1.5 text-[11px] capitalize transition-colors",
                          draft.type === type ? "border-accent bg-accent/10 text-gray-900 dark:text-foreground" : "border-gray-200 dark:border-border text-gray-500 hover:bg-gray-50 dark:hover:bg-secondary"
                        )}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Color</Label>
                  <div className="flex gap-2">
                    {Object.keys(iconTint).map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setDraft({ ...draft, color })}
                        aria-label={color}
                        className={cn(
                          "h-7 w-7 rounded-full border-2 transition-transform",
                          iconTint[color],
                          draft.color === color ? "scale-110 ring-2 ring-gray-400" : "hover:scale-105"
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <button type="button" onClick={() => setDraft(null)} className="h-8 px-3 rounded-md border border-gray-200 dark:border-border text-xs font-medium text-gray-600 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={saveDraft}
                disabled={!draft?.title.trim()}
                className="h-8 px-3 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-40"
              >
                {draft?.id ? "Save" : "Add node"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }
)
