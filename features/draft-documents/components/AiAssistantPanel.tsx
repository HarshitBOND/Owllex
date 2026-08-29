"use client"

import { useEffect, useRef, useState } from "react"
import {
  Sparkles,
  History,
  Maximize2,
  X,
  Copy,
  ThumbsUp,
  ThumbsDown,
  RotateCw,
  Plus,
  ChevronDown,
  ArrowUp,
  CheckCheck,
} from "lucide-react"
import type { ChatMessage } from "../data"

interface AiAssistantPanelProps {
  messages: ChatMessage[]
  isThinking: boolean
  quickActions: string[]
  onSend: (text: string) => void
}

export default function AiAssistantPanel({ messages, isThinking, quickActions, onSend }: AiAssistantPanelProps) {
  const [value, setValue] = useState("")
  const [reaction, setReaction] = useState<Record<string, "up" | "down">>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, isThinking])

  const handleSubmit = () => {
    if (!value.trim()) return
    onSend(value)
    setValue("")
  }

  const handleCopy = (msg: ChatMessage) => {
    const plain = `${msg.text}\n\n${msg.clauseHtml ? msg.clauseHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : ""}`.trim()
    navigator.clipboard.writeText(plain).then(() => {
      setCopiedId(msg.id)
      setTimeout(() => setCopiedId(null), 1200)
    })
  }

  const lastMessage = messages[messages.length - 1]
  const showQuickActions = !isThinking && lastMessage?.role === "assistant"

  return (
    <div className="w-full lg:w-[400px] xl:w-[430px] shrink-0 h-[70vh] lg:h-full flex flex-col rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-200 dark:border-border shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-accent" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-foreground leading-tight truncate">
              Agentic AI Assistant
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight truncate">Your legal drafting copilot</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            title="History"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Expand"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Close"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">
        {messages.map((msg) =>
          msg.role === "user" ? (
            <div key={msg.id} className="flex flex-col items-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent/10 dark:bg-accent/15 px-3.5 py-2.5 text-[13px] leading-relaxed text-gray-800 dark:text-foreground">
                {msg.text}
              </div>
              <span className="mt-1 mr-1 text-[10px] text-muted-foreground flex items-center gap-1">
                {msg.time}
                <CheckCheck className="w-3 h-3 text-accent" />
              </span>
            </div>
          ) : (
            <div key={msg.id} className="flex flex-col items-start">
              <p className="text-[13px] leading-relaxed text-gray-800 dark:text-foreground mb-2">{msg.text}</p>
              {msg.clauseHtml && (
                <div
                  className="chat-clause w-full rounded-xl border border-gray-200 dark:border-border bg-gray-50/70 dark:bg-background/40 p-3.5 text-[12.5px] leading-relaxed text-gray-700 dark:text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: msg.clauseHtml }}
                />
              )}
              <div className="mt-1.5 flex items-center gap-0.5 text-muted-foreground">
                <button
                  type="button"
                  title="Copy"
                  onClick={() => handleCopy(msg)}
                  className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
                >
                  <Copy className={`w-3.5 h-3.5 ${copiedId === msg.id ? "text-accent" : ""}`} />
                </button>
                <button
                  type="button"
                  title="Good response"
                  onClick={() => setReaction((prev) => ({ ...prev, [msg.id]: "up" }))}
                  className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
                >
                  <ThumbsUp className={`w-3.5 h-3.5 ${reaction[msg.id] === "up" ? "text-accent fill-accent/20" : ""}`} />
                </button>
                <button
                  type="button"
                  title="Bad response"
                  onClick={() => setReaction((prev) => ({ ...prev, [msg.id]: "down" }))}
                  className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
                >
                  <ThumbsDown className={`w-3.5 h-3.5 ${reaction[msg.id] === "down" ? "text-destructive" : ""}`} />
                </button>
              </div>
            </div>
          ),
        )}

        {isThinking && (
          <div className="flex items-center gap-1 px-1 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce" />
          </div>
        )}
      </div>

      {showQuickActions && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 shrink-0">
          {quickActions.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => onSend(action)}
              className="px-3 py-1.5 rounded-full border border-gray-200 dark:border-border text-[12px] text-gray-700 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-secondary transition-colors"
            >
              {action}
            </button>
          ))}
          <button
            type="button"
            title="Regenerate"
            onClick={() => onSend(lastMessage.text)}
            className="w-7 h-7 rounded-full border border-gray-200 dark:border-border flex items-center justify-center text-muted-foreground hover:bg-gray-50 dark:hover:bg-secondary transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
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
                handleSubmit()
              }
            }}
            placeholder="Ask your legal assistant anything..."
            rows={1}
            className="w-full bg-transparent resize-none px-3.5 pt-3 pb-1.5 text-[13px] text-text-100 dark:text-foreground placeholder:text-text-400 outline-none"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                title="Attach"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-text-400 hover:bg-bg-200 dark:hover:bg-secondary transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                title="History"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-text-400 hover:bg-bg-200 dark:hover:bg-secondary transition-colors"
              >
                <History className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="h-7 px-2 rounded-lg text-[11px] font-medium text-text-300 hover:bg-bg-200 dark:hover:bg-secondary transition-colors flex items-center gap-1"
              >
                Sonnet 4.5 <ChevronDown className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!value.trim()}
                className={`w-7 h-7 rounded-xl flex items-center justify-center transition-colors ${
                  value.trim() ? "bg-accent text-white hover:bg-accent-hover" : "bg-accent/30 text-white/70"
                }`}
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
        <p className="mt-2 text-center text-[10.5px] text-muted-foreground">
          Agentic AI can make mistakes. Please review important information.
        </p>
      </div>
    </div>
  )
}
