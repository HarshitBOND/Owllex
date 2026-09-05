"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai"
import { AlertCircle, ArrowUp, Check, ChevronDown, Pin, PinOff, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { AiLimitNotice, parseAiLimitError } from "@/components/ui/ai-limit-notice"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  colorClasses,
  type WorkflowConnection,
  type WorkflowNode,
  type WorkflowNodeTemplate,
} from "@/components/ui/n8n-workflow-block-shadcnui"
import { WORKFLOW_ICON_MAP, type WorkflowIconKey } from "@/lib/workflow-icon-registry"
import {
  layoutNodes,
  serializeNodes,
  type SerializedWorkflowNode,
} from "@/features/ai-workflow/workflow-serialize"
import { MODELS, DEFAULT_MODEL, type ModelKey } from "@/lib/ai/models"
import { useAllowedModels } from "@/hooks/useAllowedModels"

const QUICK_ACTIONS = [
  "Extract key dates and deadlines",
  "Identify governing law and jurisdiction",
  "Add approval step before final response",
]

type ProposedNode = SerializedWorkflowNode

type ProposeWorkflowInput = {
  nodes?: ProposedNode[]
  connections?: { from: string; to: string }[]
  summary?: string
  suggestions?: string[]
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
  templates?: WorkflowNodeTemplate[]
  onAddNode?: (template: WorkflowNodeTemplate) => void
  pinned?: boolean
  onTogglePin?: () => void
  onClose?: () => void
  /** A brief to start building from, sent once when the panel opens. */
  seedPrompt?: string
}

export interface WorkflowAiChatPanelHandle {
  focusInput: () => void
}

const WorkflowAiChatPanel = forwardRef<WorkflowAiChatPanelHandle, WorkflowAiChatPanelProps>(function WorkflowAiChatPanel({
  chatId,
  currentWorkflow,
  onApply,
  templates = [],
  onAddNode,
  pinned = false,
  onTogglePin,
  onClose,
  seedPrompt,
}, ref) {
  const seeded = useRef(false)
  const [value, setValue] = useState("")
  const [tab, setTab] = useState<"assistant" | "library">("assistant")
  const [model, setModel] = useState<ModelKey>(DEFAULT_MODEL)
  const allowedModels = useAllowedModels()
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({
    focusInput: () => {
      setTab("assistant")
      textareaRef.current?.focus()
    },
  }))
  const workflowRef = useRef(currentWorkflow)
  workflowRef.current = currentWorkflow
  const appliedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (allowedModels && !allowedModels.includes(model)) {
      setModel(allowedModels.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : (allowedModels[0] as ModelKey))
    }
  }, [allowedModels, model])

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/ai/workflow" }), [])

  const { messages, sendMessage, status, addToolResult, error, clearError } = useChat({
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
            model,
            workflow: {
              nodes: serializeNodes(wf.nodes),
              connections: wf.connections,
            },
          },
        }
      )
    },
    [busy, sendMessage, model]
  )

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, status])

  // Arriving from an approved "build the workflow" step: the brief that was
  // agreed in chat starts the build here, once, so the advocate lands on a
  // canvas already working rather than an empty prompt box. Mirrors how a
  // seeded draft starts itself in the document editor.
  useEffect(() => {
    if (seeded.current || !seedPrompt || busy || messages.length > 0) return
    seeded.current = true
    send(seedPrompt)
  }, [seedPrompt, busy, messages.length, send])

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
    <Tabs value={tab} onValueChange={(v) => setTab(v as "assistant" | "library")} className="w-full shrink-0 h-[70vh] lg:h-full flex flex-col rounded-2xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden lg:w-[340px] xl:w-[368px] gap-0">
      <div className="flex items-center justify-between px-3 pt-3 border-b border-gray-200 dark:border-border shrink-0">
        <TabsList className="bg-transparent p-0 h-auto gap-4">
          <TabsTrigger
            value="assistant"
            className="rounded-none border-0 border-b-2 border-transparent px-0.5 pb-2.5 bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:border-accent data-[state=active]:text-gray-900 dark:data-[state=active]:text-foreground text-gray-400 dark:text-muted-foreground text-[13px] font-semibold"
          >
            AI Assistant
          </TabsTrigger>
          <TabsTrigger
            value="library"
            className="rounded-none border-0 border-b-2 border-transparent px-0.5 pb-2.5 bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:border-accent data-[state=active]:text-gray-900 dark:data-[state=active]:text-foreground text-gray-400 dark:text-muted-foreground text-[13px] font-semibold"
          >
            Node Library
          </TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-0.5 pb-2.5">
          <button
            type="button"
            title={pinned ? "Unpin panel" : "Pin panel"}
            onClick={onTogglePin}
            className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
              pinned ? "text-accent bg-accent/10" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-secondary"
            )}
          >
            {pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            title="Close panel"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <TabsContent value="assistant" className="flex flex-col flex-1 min-h-0 m-0">
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-2 px-1">
              <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center mx-auto">
                <Sparkles className="w-5 h-5 text-accent" />
              </div>
              <p className="mt-3 text-[15px] font-semibold text-gray-900 dark:text-foreground">
                How can I help you build your workflow?
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Describe what you want to build in natural language.
              </p>
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

        <div className="border-t border-gray-200 dark:border-border p-3 shrink-0 space-y-3">
          <div className="rounded-2xl border border-bg-300 dark:border-border bg-bg-100 dark:bg-background/60 focus-within:border-accent/50 transition-colors">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder="e.g. Extract parties, check governing law, and draft a summary..."
              rows={2}
              className="w-full bg-transparent resize-none px-3.5 pt-3 pb-1.5 text-[13px] text-text-100 dark:text-foreground placeholder:text-text-400 outline-none"
            />
            <div className="flex items-center justify-between px-2 pb-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 px-2 h-7 rounded-lg text-[11.5px] font-medium text-gray-500 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
                  >
                    {MODELS[model].name}
                    <ChevronDown className="w-3 h-3 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top">
                  {(Object.entries(MODELS) as [ModelKey, (typeof MODELS)[ModelKey]][]).map(([key, m]) => {
                    const locked = allowedModels ? !allowedModels.includes(key) : false
                    return (
                      <DropdownMenuItem
                        key={key}
                        disabled={locked}
                        onClick={() => setModel(key)}
                        className="flex items-start justify-between gap-3"
                      >
                        <div className="flex flex-col">
                          <span className="text-[12.5px] font-medium">{m.name}</span>
                          <span className="text-[11px] text-muted-foreground">{m.description}</span>
                        </div>
                        {model === key && <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

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

          {messages.length === 0 && !busy && (
            <div className="flex flex-col gap-1.5">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => send(action)}
                  className="text-left px-3 py-2 rounded-lg border border-gray-200 dark:border-border text-[12px] text-gray-700 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-secondary hover:border-accent/30 transition-colors"
                >
                  {action}
                </button>
              ))}
            </div>
          )}

          {suggestions.length > 0 && (
            <div>
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

        </div>
      </TabsContent>

      <TabsContent value="library" className="flex flex-col flex-1 min-h-0 m-0 overflow-y-auto custom-scrollbar px-3 py-3">
        <p className="text-[11px] text-muted-foreground px-1 mb-2">Click a step to add it to the canvas.</p>
        <div className="flex flex-col gap-1.5">
          {templates.map((template, i) => {
            const Icon = template.icon
            return (
              <button
                key={`${template.title}-${i}`}
                type="button"
                onClick={() => onAddNode?.(template)}
                className="flex items-start gap-2.5 text-left px-2.5 py-2.5 rounded-lg border border-gray-200 dark:border-border hover:bg-gray-50 dark:hover:bg-secondary hover:border-accent/30 transition-colors"
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg border flex items-center justify-center shrink-0",
                    colorClasses[template.color] ?? colorClasses.indigo
                  )}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-gray-900 dark:text-foreground truncate">{template.title}</p>
                  <p className="text-[11px] text-gray-500 dark:text-muted-foreground line-clamp-2">{template.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      </TabsContent>
    </Tabs>
  )
})

export default WorkflowAiChatPanel
