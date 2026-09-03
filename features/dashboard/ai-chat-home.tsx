"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  type FileUIPart,
  type UIDataTypes,
  type UIMessage,
  type UIMessagePart,
  type UITools,
} from "ai"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { AlertTriangle, ArrowDown, Check, Copy, Library, RefreshCw, Search, Users } from "lucide-react"
import ChatReasoning from "@/components/ui/chat-reasoning"
import { ClaudeChatInput, type ClaudeChatInputSubmission } from "@/components/ui/claude-style-chat-input"
import { useAiChat } from "@/contexts/AiChatContext"
import { AiLimitNotice, parseAiLimitError } from "@/components/ui/ai-limit-notice"
import { useAllowedModels } from "@/hooks/useAllowedModels"

const SUGGESTIONS = [
  "Draft an affidavit",
  "Summarize a judgment",
  "Review a contract",
  "Explain a limitation period",
]

const TOOL_LABELS: Record<string, { running: string; done: string; icon: typeof Search }> = {
  searchCases: { running: "Searching your cases", done: "Searched your cases", icon: Search },
  searchClients: { running: "Looking up your clients", done: "Looked up your clients", icon: Users },
  searchCorpusDocuments: { running: "Reading corpus documents", done: "Read corpus documents", icon: Library },
}

type ChatPart = UIMessagePart<UIDataTypes, UITools>

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

// Reasoning steps and tool calls share the collapsible thinking trail above the answer.
const renderThinkingPart = (part: ChatPart, key: string | number) => {
  if (part.type === "reasoning") {
    return (
      <p key={key} className="text-[13px] text-text-300 leading-relaxed py-1 whitespace-pre-wrap">
        {(part as any).text}
      </p>
    )
  }

  if (isToolUIPart(part)) {
    const name = getToolName(part)
    const meta = TOOL_LABELS[name] ?? { running: `Running ${name}`, done: `Ran ${name}`, icon: Search }
    const done = part.state === "output-available"
    const failed = part.state === "output-error"
    const Icon = meta.icon
    return (
      <div key={key} className="flex items-center gap-2 text-[13px] text-text-300 py-1">
        {failed ? (
          <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
        ) : done ? (
          <Check className="w-3.5 h-3.5 text-accent shrink-0" />
        ) : (
          <Icon className="w-3.5 h-3.5 animate-pulse shrink-0" />
        )}
        <span>
          {failed ? `Could not ${meta.running.toLowerCase()}` : done ? meta.done : `${meta.running}…`}
        </span>
      </div>
    )
  }

  return null
}

export function AiChatHome() {
  const { user } = useUser()
  const router = useRouter()
  const { activeId, conversations, loaded, refresh, corpora, activeCorpusId, setActiveCorpusId } = useAiChat()
  const reduceMotion = useReducedMotion()

  const [model, setModel] = useState<string>("fast")
  const allowedModels = useAllowedModels()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)

  // Messages already seen for a conversation, so switching back is instant instead of
  // blanking to the greeting screen while a refetch is in flight.
  const cacheRef = useRef(new Map<string, { messages: UIMessage[]; partial: boolean }>())
  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations
  const loadedRef = useRef(loaded)
  loadedRef.current = loaded

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/ai/chat", body: { model, corpusId: activeCorpusId } }),
    [model, activeCorpusId]
  )

  const { messages, sendMessage, setMessages, status, stop, regenerate, error, clearError } = useChat({
    id: activeId,
    transport,
    onFinish: () => refresh(),
  })

  const busy = status === "submitted" || status === "streaming"

  useEffect(() => {
    if (!messages.length) return
    cacheRef.current.set(activeId, { messages, partial: busy })
  }, [activeId, messages, busy])

  // Runs only when the conversation actually changes. Refreshing the sidebar list must
  // never reach in here and wipe a live thread.
  useEffect(() => {
    const id = activeId
    const cached = cacheRef.current.get(id)
    const known = conversationsRef.current.some((c) => c.id === id)

    setAtBottom(true)
    atBottomRef.current = true
    setMessages(cached ? cached.messages : [])

    // A locally created id that is not in the list is a brand new chat: nothing to load.
    if (!cached && loadedRef.current && !known) {
      setLoadingHistory(false)
      return
    }
    if (cached && !cached.partial) {
      setLoadingHistory(false)
      return
    }

    const controller = new AbortController()
    let aborted = false
    setLoadingHistory(!cached)

    fetch(`/api/ai/conversations/${id}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const stored = d?.conversation?.messages
        if (Array.isArray(stored) && stored.length) {
          cacheRef.current.set(id, { messages: stored, partial: false })
          setMessages(stored)
        }
        setLoadingHistory(false)
      })
      .catch(() => {
        if (!aborted) setLoadingHistory(false)
      })

    return () => {
      aborted = true
      controller.abort()
    }
  }, [activeId, setMessages])

  useEffect(() => {
    if (!atBottomRef.current) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: busy ? "smooth" : "auto" })
  }, [messages, status, busy, loadingHistory])

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

    setAtBottom(true)
    atBottomRef.current = true
    sendMessage({ text: text + pasted, files: files.length ? files : undefined })
  }

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return
    }
    setCopiedId(id)
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500)
  }

  const hasMessages = messages.length > 0
  const showThread = hasMessages || loadingHistory
  const lastAssistantIndex = messages.map((m) => m.role).lastIndexOf("assistant")
  const spring = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 260, damping: 30 }

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {showThread && (
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget
            const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
            atBottomRef.current = bottom
            setAtBottom(bottom)
          }}
          className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-6"
        >
          <div className="max-w-2xl mx-auto flex flex-col gap-5">
            {loadingHistory && !hasMessages && (
              <div className="flex flex-col gap-5 animate-pulse" aria-hidden>
                <div className="self-end h-10 w-2/5 rounded-2xl rounded-br-md bg-bg-200" />
                <div className="flex flex-col gap-2">
                  <div className="h-3.5 w-11/12 rounded bg-bg-200" />
                  <div className="h-3.5 w-4/5 rounded bg-bg-200" />
                  <div className="h-3.5 w-2/3 rounded bg-bg-200" />
                </div>
                <div className="self-end h-10 w-1/3 rounded-2xl rounded-br-md bg-bg-200" />
                <div className="flex flex-col gap-2">
                  <div className="h-3.5 w-10/12 rounded bg-bg-200" />
                  <div className="h-3.5 w-3/5 rounded bg-bg-200" />
                </div>
              </div>
            )}

            {messages.map((m, index) => {
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
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent/10 text-text-100 px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                      {textContent}
                      {m.parts.some((p) => p.type === "file") && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {m.parts
                            .filter((p) => p.type === "file")
                            .map((p: any, i) => (
                              <span key={i} className="text-[11px] px-1.5 py-0.5 rounded-full bg-text-100/10">
                                {p.filename || "attachment"}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )
              }

              const thinkingParts = m.parts.filter(
                (p) => p.type === "reasoning" || isToolUIPart(p)
              ) as ChatPart[]
              const thinkingOpen = index === messages.length - 1 && busy && !textContent

              return (
                <motion.div
                  key={m.id}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="group flex flex-col gap-2"
                >
                  {thinkingParts.length > 0 && (
                    <ChatReasoning
                      partsInAccordion={thinkingParts}
                      defaultValue={thinkingOpen ? "reasoning" : undefined}
                      renderMessagePart={renderThinkingPart}
                      className="[&>div]:border-b-0"
                    />
                  )}

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
                      {index === lastAssistantIndex && (
                        <button
                          onClick={() => regenerate()}
                          className="p-1.5 rounded-md text-text-400 hover:text-text-100 hover:bg-bg-200 transition-colors"
                          aria-label="Regenerate response"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
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

            {error &&
              (() => {
                const limit = parseAiLimitError(error.message)
                if (limit) return <AiLimitNotice limit={limit} />
                return (
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
                )
              })()}
          </div>
        </div>
      )}

      {showThread && !atBottom && (
        <button
          onClick={() => {
            atBottomRef.current = true
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
          showThread
            ? "shrink-0 px-4 pb-4 pt-2"
            : "flex-1 flex flex-col items-center justify-center px-4 py-8"
        }
      >
        <AnimatePresence mode="popLayout">
          {!showThread && (
            <motion.div
              key="hero"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
              transition={{ duration: 0.25 }}
              className="w-full max-w-2xl mb-8 text-center"
            >
              <div className="w-16 h-16 mx-auto mb-5 flex items-center justify-center rounded-2xl bg-accent/10">
                <Image src="/logo.png" alt="" width={32} height={32} className="w-8 h-8 object-contain" />
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
            isGenerating={busy}
            onStop={stop}
            corpora={corpora}
            activeCorpusId={activeCorpusId}
            onSelectCorpus={setActiveCorpusId}
            allowedModels={allowedModels}
            defaultModel="fast"
          />
        </motion.div>

        <AnimatePresence>
          {!showThread && (
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

              {corpora.length > 0 && (
                <div className="w-full flex flex-wrap justify-center items-center gap-2 mt-3">
                  <span className="text-[11px] text-text-400 uppercase tracking-wider">Corpus</span>
                  {corpora.slice(0, 4).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setActiveCorpusId(c.id === activeCorpusId ? null : c.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs sm:text-[13px] transition-colors ${
                        c.id === activeCorpusId
                          ? "border-accent/40 bg-accent/10 text-accent"
                          : "border-bg-300 text-text-300 hover:bg-bg-200 hover:text-text-100"
                      }`}
                    >
                      <Library className="w-3.5 h-3.5" />
                      {c.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => router.push("/corpus")}
                    className="px-3 py-1.5 rounded-full border border-dashed border-bg-300 text-text-400 text-xs sm:text-[13px] hover:text-text-100 hover:bg-bg-200 transition-colors"
                  >
                    All corpus
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div aria-live="polite" className="sr-only">
        {loadingHistory && "Loading conversation"}
        {status === "submitted" && "Assistant is thinking"}
        {status === "streaming" && "Assistant is responding"}
        {status === "ready" && hasMessages && "Response complete"}
      </div>
    </div>
  )
}
