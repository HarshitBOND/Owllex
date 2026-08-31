"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, getToolName, isToolUIPart, type FileUIPart } from "ai"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { AlertTriangle, ArrowDown, Check, Copy, RefreshCw, Search, Square, Users } from "lucide-react"
import { ClaudeChatInput, type ClaudeChatInputSubmission } from "@/components/ui/claude-style-chat-input"
import { useAiChat } from "@/contexts/AiChatContext"
import { DEFAULT_MODEL } from "@/lib/ai/models"

const SUGGESTIONS = [
  "Draft an affidavit",
  "Summarize a judgment",
  "Review a contract",
  "Explain a limitation period",
]

const TOOL_LABELS: Record<string, { running: string; done: string; icon: typeof Search }> = {
  searchCases: { running: "Searching your cases", done: "Searched your cases", icon: Search },
  searchClients: { running: "Looking up your clients", done: "Looked up your clients", icon: Users },
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

const markdownComponents = {
  h1: (p: any) => <h1 className="text-lg font-semibold text-text-100 mt-4 mb-2 first:mt-0" {...p} />,
  h2: (p: any) => <h2 className="text-base font-semibold text-text-100 mt-4 mb-2 first:mt-0" {...p} />,
  h3: (p: any) => <h3 className="text-sm font-semibold text-text-100 mt-3 mb-1.5 first:mt-0" {...p} />,
  p: (p: any) => <p className="mb-2.5 last:mb-0 leading-relaxed" {...p} />,
  ul: (p: any) => <ul className="list-disc pl-5 mb-2.5 space-y-1" {...p} />,
  ol: (p: any) => <ol className="list-decimal pl-5 mb-2.5 space-y-1" {...p} />,
  li: (p: any) => <li className="leading-relaxed" {...p} />,
  strong: (p: any) => <strong className="font-semibold text-text-100" {...p} />,
  a: (p: any) => <a className="text-accent underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />,
  blockquote: (p: any) => <blockquote className="border-l-2 border-bg-300 pl-3 italic text-text-300 my-2.5" {...p} />,
  code: ({ inline, ...p }: any) =>
    inline ? (
      <code className="px-1 py-0.5 rounded bg-bg-300/60 text-[0.85em] font-mono" {...p} />
    ) : (
      <code className="block p-3 rounded-lg bg-bg-300/50 text-[0.85em] font-mono overflow-x-auto" {...p} />
    ),
  table: (p: any) => (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-left border-collapse text-[13px]" {...p} />
    </div>
  ),
  th: (p: any) => <th className="border border-bg-300 px-2.5 py-1.5 font-semibold bg-bg-200" {...p} />,
  td: (p: any) => <td className="border border-bg-300 px-2.5 py-1.5 align-top" {...p} />,
}

export function AiChatHome() {
  const { user } = useUser()
  const router = useRouter()
  const { activeId, conversations, refresh } = useAiChat()
  const reduceMotion = useReducedMotion()

  const [model, setModel] = useState<string>(DEFAULT_MODEL)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/ai/chat", body: { model } }),
    [model]
  )

  const { messages, sendMessage, setMessages, status, stop, regenerate, error, clearError } = useChat({
    id: activeId,
    transport,
    onFinish: () => refresh(),
  })

  useEffect(() => {
    let cancelled = false
    setMessages([])
    if (!conversations.some((c) => c.id === activeId)) return

    fetch(`/api/ai/conversations/${activeId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.conversation?.messages) setMessages(d.conversation.messages)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activeId, conversations, setMessages])

  useEffect(() => {
    if (atBottom) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
    }
  }, [messages, status, atBottom])

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 17) return "Good afternoon"
    return "Good evening"
  }, [])

  const submit = async (data: ClaudeChatInputSubmission) => {
    const text = data.message.trim()
    if (!text && data.files.length === 0 && data.pastedContent.length === 0) return

    if (data.mode?.id === "contract-review") {
      const params = new URLSearchParams()
      if (data.files[0]) params.set("file", data.files[0].file.name)
      router.push(`/contract-review${params.toString() ? `?${params.toString()}` : ""}`)
      return
    }

    if (data.model) setModel(data.model)

    const pasted = data.pastedContent.map((p) => `\n\n---\n${p.content}`).join("")
    const files: FileUIPart[] = await Promise.all(
      data.files.map(async (f) => ({
        type: "file" as const,
        mediaType: f.file.type || "application/octet-stream",
        filename: f.file.name,
        url: await readAsDataUrl(f.file),
      }))
    )

    sendMessage({ text: text + pasted, files: files.length ? files : undefined })
  }

  const copy = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500)
  }

  const hasMessages = messages.length > 0
  const busy = status === "submitted" || status === "streaming"
  const spring = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 260, damping: 30 }

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {hasMessages && (
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget
            setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 100)
          }}
          className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-6"
        >
          <div className="max-w-2xl mx-auto flex flex-col gap-5">
            {messages.map((m) => {
              const textContent = m.parts
                .filter((p) => p.type === "text")
                .map((p: any) => p.text)
                .join("")

              if (m.role === "user") {
                return (
                  <motion.div
                    key={m.id}
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex justify-end"
                  >
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent text-bg-0 px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                      {textContent}
                      {m.parts.some((p) => p.type === "file") && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {m.parts
                            .filter((p) => p.type === "file")
                            .map((p: any, i) => (
                              <span key={i} className="text-[11px] px-1.5 py-0.5 rounded-full bg-black/15">
                                {p.filename || "attachment"}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )
              }

              return (
                <motion.div
                  key={m.id}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="group flex flex-col gap-2"
                >
                  {m.parts.filter(isToolUIPart).map((part, i) => {
                    const name = getToolName(part)
                    const meta = TOOL_LABELS[name] ?? { running: `Running ${name}`, done: `Ran ${name}`, icon: Search }
                    const done = part.state === "output-available"
                    const failed = part.state === "output-error"
                    const Icon = meta.icon
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 text-[13px] text-text-300"
                      >
                        {failed ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                        ) : done ? (
                          <Check className="w-3.5 h-3.5 text-accent" />
                        ) : (
                          <Icon className="w-3.5 h-3.5 animate-pulse" />
                        )}
                        <span>{failed ? `Couldn't ${meta.running.toLowerCase()}` : done ? meta.done : `${meta.running}…`}</span>
                      </motion.div>
                    )
                  })}

                  {textContent && (
                    <div className="text-sm text-text-100 leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {textContent}
                      </ReactMarkdown>
                    </div>
                  )}

                  {!busy && textContent && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        onClick={() => copy(m.id, textContent)}
                        className="p-1.5 rounded-md text-text-400 hover:text-text-100 hover:bg-bg-200 transition-colors"
                        aria-label="Copy response"
                      >
                        {copiedId === m.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => regenerate()}
                        className="p-1.5 rounded-md text-text-400 hover:text-text-100 hover:bg-bg-200 transition-colors"
                        aria-label="Regenerate response"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </motion.div>
              )
            })}

            {status === "submitted" && (
              <div className="flex items-center gap-1.5 text-text-300">
                <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce [animation-delay:-0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce [animation-delay:-0.1s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce" />
                <span className="text-[13px] ml-1">Thinking…</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <div className="flex-1 text-[13px] text-text-200">
                  <p className="font-medium text-text-100">Something went wrong</p>
                  <p className="text-text-300">{error.message || "The assistant couldn't respond."}</p>
                </div>
                <button
                  onClick={() => {
                    clearError()
                    regenerate()
                  }}
                  className="text-[13px] font-medium text-accent hover:underline shrink-0"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {hasMessages && !atBottom && (
        <button
          onClick={() => {
            setAtBottom(true)
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
          }}
          className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-0 border border-bg-300 shadow-md text-[13px] text-text-200 hover:bg-bg-200 transition-colors"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          Jump to latest
        </button>
      )}

      <motion.div
        layout={!reduceMotion}
        transition={spring}
        className={
          hasMessages
            ? "shrink-0 px-4 pb-4 pt-2"
            : "flex-1 flex flex-col items-center justify-center px-4 py-8"
        }
      >
        <AnimatePresence mode="popLayout">
          {!hasMessages && (
            <motion.div
              key="hero"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
              transition={{ duration: 0.25 }}
              className="w-full max-w-2xl mb-8 text-center"
            >
              <div className="w-16 h-16 mx-auto mb-5 flex items-center justify-center rounded-2xl bg-accent/10">
                <img src="/logo.png" alt="" className="w-8 h-8 object-contain" />
              </div>
              <h1 className="font-serif text-3xl sm:text-4xl font-light text-text-100 mb-2 tracking-tight">
                {greeting}, {user?.firstName || "Counselor"}
              </h1>
              <p className="text-text-300 text-sm sm:text-base">
                Ask about your cases, draft documents, or get quick legal guidance.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div layout={!reduceMotion} transition={spring} className="w-full">
          <ClaudeChatInput
            onSendMessage={submit}
            placeholder="Ask your legal assistant anything..."
            disabled={busy}
          />
        </motion.div>

        {busy && (
          <button
            onClick={stop}
            className="mx-auto mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-bg-300 text-[13px] text-text-300 hover:text-text-100 hover:bg-bg-200 transition-colors"
          >
            <Square className="w-3 h-3 fill-current" />
            Stop
          </button>
        )}

        <AnimatePresence>
          {!hasMessages && (
            <motion.div
              key="suggestions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-wrap justify-center gap-2 mt-5 max-w-2xl mx-auto"
            >
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => sendMessage({ text: s })}
                  className="px-3 py-1.5 rounded-full border border-bg-300 text-text-300 text-xs sm:text-[13px] hover:bg-bg-200 hover:text-text-100 transition-colors"
                >
                  {s}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div aria-live="polite" className="sr-only">
        {status === "submitted" && "Assistant is thinking"}
        {status === "streaming" && "Assistant is responding"}
        {status === "ready" && hasMessages && "Response complete"}
      </div>
    </div>
  )
}
