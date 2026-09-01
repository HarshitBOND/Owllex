"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai"
import { AlertCircle, ArrowUp, RotateCw, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { AiLimitNotice, parseAiLimitError } from "@/components/ui/ai-limit-notice"
import {
  colorClasses,
  type WorkflowConnection,
  type WorkflowNode,
} from "@/components/ui/n8n-workflow-block-shadcnui"
import { WORKFLOW_ICON_MAP, iconKeyFor, type WorkflowIconKey } from "@/lib/workflow-icon-registry"

const STARTER_PROMPTS = [
  "Create a workflow that takes a contract, extracts clauses, checks risk, and drafts a response.",
  "Add an approval step before drafting the response.",
]

const NODE_WIDTH = 200
const NODE_GAP = 50

type ProposedNode = {
  id: string
  type: "trigger" | "action" | "condition"
  title: string
  description: string
  icon: string
  color: string
}

type ProposeWorkflowInput = {
  nodes?: ProposedNode[]
  connections?: { from: string; to: string }[]
  summary?: string
  suggestions?: string[]
}

function layoutNodes(nodes: ProposedNode[]): WorkflowNode[] {
  return nodes.map((n, i) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    description: n.description,
    icon: WORKFLOW_ICON_MAP[n.icon as WorkflowIconKey] ?? WORKFLOW_ICON_MAP.sparkles,
    color: n.color,
    position: { x: i * (NODE_WIDTH + NODE_GAP), y: 100 },
  }))
}

function WorkflowPreviewChain({ nodes }: { nodes: ProposedNode[] }) {
  return (
    <div className="flex items-start gap-0 overflow-x-auto custom-scrollbar py-1">
      {nodes.map((n, i) => {
        const Icon = WORKFLOW_ICON_MAP[n.icon as WorkflowIconKey] ?? Sparkles
        return (
          <div key={n.id} className="flex items-start shrink-0">
            {i > 0 && <div className="w-4 border-t border-dashed border-gray-300 dark:border-border mt-4 mx-1" />}
            <div className="flex flex-col items-center gap-1 w-16">
              <div
                className={cn(
                  "w-8 h-8 rounded-lg border flex items-center justify-center",
                  colorClasses[n.color] ?? colorClasses.indigo
                )}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-[9.5px] text-center text-muted-foreground leading-tight line-clamp-2">
                {n.title}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface WorkflowAiChatPanelProps {
  chatId: string
  currentWorkflow: { nodes: WorkflowNode[]; connections: WorkflowConnection[] }
  onApply: (nodes: WorkflowNode[], connections: WorkflowConnection[]) => void
}

export default function WorkflowAiChatPanel({ chatId, currentWorkflow, onApply }: WorkflowAiChatPanelProps) {
  const [value, setValue] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const workflowRef = useRef(currentWorkflow)
  workflowRef.current = currentWorkflow
  const appliedRef = useRef<Set<string>>(new Set())

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/ai/workflow" }), [])

  const { messages, sendMessage, status, regenerate, addToolResult, error, clearError } = useChat({
    id: chatId,
    transport,
  })

  const busy = status === "submitted" || status === "streaming"

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || busy) return
      const wf = workflowRef.current
      sendMessage(
        { text: trimmed },
        {
          body: {
            workflow: {
              nodes: wf.nodes.map((n) => ({
                id: n.id,
                type: n.type,
                title: n.title,
                description: n.description,
                icon: iconKeyFor(n.icon),
                color: n.color,
              })),
              connections: wf.connections,
            },
          },
        }
      )
    },
    [busy, sendMessage]
  )

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, status])

  // Auto-apply a workflow the moment the model finishes proposing it there is
  // nothing destructive here (unlike a document redline), so no accept step.
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== "assistant") continue
      for (const part of msg.parts) {
        if (!isToolUIPart(part) || getToolName(part) !== "proposeWorkflow") continue
        if (part.state !== "input-available" && part.state !== "output-available") continue
        if (appliedRef.current.has(part.toolCallId)) continue
        const input = part.input as ProposeWorkflowInput | undefined
        if (!input?.nodes?.length) continue

        appliedRef.current.add(part.toolCallId)
        onApply(layoutNodes(input.nodes), input.connections ?? [])
        if (part.state === "input-available") {
          addToolResult({ tool: "proposeWorkflow", toolCallId: part.toolCallId, output: { applied: true } })
        }
      }
    }
  }, [messages, onApply, addToolResult])

  const submit = () => {
    if (!value.trim()) return
    send(value)
    setValue("")
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")
  const lastProposal = lastAssistant?.parts.find(
    (p) => isToolUIPart(p) && getToolName(p) === "proposeWorkflow"
  ) as { input?: ProposeWorkflowInput } | undefined
  const suggestions = !busy ? lastProposal?.input?.suggestions?.filter(Boolean) ?? [] : []

  return (
    <div className="w-full shrink-0 h-[70vh] lg:h-full flex flex-col rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden lg:w-[400px] xl:w-[430px]">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-200 dark:border-border shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-accent" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-foreground leading-tight truncate">
              Generate the workflow
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight truncate">
              Describe it, and the canvas updates live
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            title="Regenerate the last reply"
            onClick={() => regenerate()}
            disabled={busy}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors shrink-0 disabled:opacity-40"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="text-center py-6 px-2">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mx-auto">
                <Sparkles className="w-5 h-5 text-accent" />
              </div>
              <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-foreground">
                Describe the workflow you need
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tell the assistant what the pipeline should do. You can customize any step, add conditions, or
                update the actions afterwards.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => send(p)}
                  className="text-left px-3 py-2 rounded-lg border border-gray-200 dark:border-border text-[12px] text-gray-700 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-secondary transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const text = msg.parts
            .filter((p) => p.type === "text")
            .map((p) => (p as { text: string }).text)
            .join("")

          if (msg.role === "user") {
            return (
              <div key={msg.id} className="flex flex-col items-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent/10 dark:bg-accent/15 px-3.5 py-2.5 text-[13px] leading-relaxed text-gray-800 dark:text-foreground whitespace-pre-wrap">
                  {text}
                </div>
              </div>
            )
          }

          const proposal = msg.parts.find(
            (p) => isToolUIPart(p) && getToolName(p) === "proposeWorkflow"
          ) as { input?: ProposeWorkflowInput } | undefined

          return (
            <div key={msg.id} className="flex flex-col items-start">
              {text && (
                <p className="text-[13px] leading-relaxed text-gray-800 dark:text-foreground mb-2 whitespace-pre-wrap">
                  {text}
                </p>
              )}

              {proposal?.input?.nodes && proposal.input.nodes.length > 0 && (
                <div className="w-full rounded-xl border border-gray-200 dark:border-border bg-gray-50/70 dark:bg-background/40 px-3 py-3">
                  <WorkflowPreviewChain nodes={proposal.input.nodes} />
                </div>
              )}
            </div>
          )
        })}

        {busy && (
          <div className="flex items-center gap-1 px-1 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce" />
          </div>
        )}

        {error &&
          (() => {
            const limit = parseAiLimitError(error.message)
            if (limit) return <AiLimitNotice limit={limit} />
            return (
              <div className="rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-3.5 py-2.5">
                <p className="text-[12px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{error.message || "The assistant is unavailable right now."}</span>
                </p>
                <button
                  type="button"
                  onClick={clearError}
                  className="mt-1.5 text-[11px] font-medium text-amber-900 dark:text-amber-200 underline"
                >
                  Dismiss
                </button>
              </div>
            )
          })()}
      </div>

      {suggestions.length > 0 && (
        <div className="px-4 pb-3 shrink-0">
          <p className="text-[11px] font-medium text-muted-foreground mb-1.5">How would you like to proceed?</p>
          <div className="flex flex-wrap items-center gap-2">
            {suggestions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => send(action)}
                className="px-3 py-1.5 rounded-full border border-gray-200 dark:border-border text-[12px] text-gray-700 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-secondary transition-colors"
              >
                {action}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-gray-200 dark:border-border p-3 shrink-0">
        <div className="rounded-2xl border border-bg-300 dark:border-border bg-bg-100 dark:bg-background/60 focus-within:border-accent/50 transition-colors">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Ask AI to build or edit your workflow..."
            rows={1}
            className="w-full bg-transparent resize-none px-3.5 pt-3 pb-1.5 text-[13px] text-text-100 dark:text-foreground placeholder:text-text-400 outline-none"
          />
          <div className="flex items-center justify-end px-2 pb-2">
            <button
              type="button"
              onClick={submit}
              disabled={!value.trim() || busy}
              className={cn(
                "w-7 h-7 rounded-xl flex items-center justify-center transition-colors",
                value.trim() && !busy ? "bg-accent text-white hover:bg-accent-hover" : "bg-accent/30 text-white/70"
              )}
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
