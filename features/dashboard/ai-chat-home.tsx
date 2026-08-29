"use client"

import { useMemo, useRef, useState, useEffect } from "react"
import { useUser } from "@clerk/nextjs"
import { FileText, FileSearch, UsersRound, Scale, Sparkles } from "lucide-react"
import { ClaudeChatInput, type ClaudeChatInputSubmission } from "@/components/ui/claude-style-chat-input"
import type { ChatMessage } from "./ai-chat-types"

const quickPrompts = [
  {
    label: "Draft an affidavit",
    icon: FileText,
    prompt: "Help me draft an affidavit for a property dispute case.",
  },
  {
    label: "Track a case",
    icon: FileSearch,
    prompt: "What's the current status of my case, and when is the next hearing?",
  },
  {
    label: "Find a lawyer",
    icon: UsersRound,
    prompt: "I need a lawyer who specializes in family law near me.",
  },
  {
    label: "Legal question",
    icon: Scale,
    prompt: "Can you explain what a cease and desist notice does?",
  },
]

const COMING_SOON_REPLY = "The AI legal assistant isn't connected yet — this feature is coming soon."

interface AiChatHomeProps {
  messages: ChatMessage[]
  addUserMessage: (text: string, fileNames: string[]) => string
  addAssistantMessage: (conversationId: string, text: string) => void
}

export function AiChatHome({ messages, addUserMessage, addAssistantMessage }: AiChatHomeProps) {
  const { user } = useUser()
  const [isResponding, setIsResponding] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, isResponding])

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 17) return "Good afternoon"
    return "Good evening"
  }, [])

  const submit = (data: ClaudeChatInputSubmission) => {
    if (!data.message.trim() && data.files.length === 0 && data.pastedContent.length === 0) return

    const fileNames = [
      ...data.files.map((f) => f.file.name),
      ...data.pastedContent.map(() => "Pasted text"),
    ]

    const conversationId = addUserMessage(data.message, fileNames)
    setIsResponding(true)

    setTimeout(() => {
      addAssistantMessage(conversationId, COMING_SOON_REPLY)
      setIsResponding(false)
    }, 400)
  }

  const hasMessages = messages.length > 0

  return (
    <div className="flex flex-col min-h-[calc(100vh-160px)]">
      {!hasMessages && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
          <div className="w-full max-w-2xl mb-8 text-center animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-5 flex items-center justify-center rounded-2xl bg-accent/10">
              <Sparkles className="w-8 h-8 text-accent" />
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground mb-3">
              <Sparkles className="h-3 w-3 text-accent" />
              Agentic AI, purpose-built for legal work
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl font-light text-text-100 mb-2 tracking-tight">
              {greeting}, {user?.firstName || "Counselor"}
            </h1>
            <p className="text-text-300 text-sm sm:text-base">
              Ask about your cases, draft documents, or get quick legal guidance.
            </p>
          </div>

          <ClaudeChatInput onSendMessage={submit} placeholder="Ask your legal assistant anything..." />

          <div className="flex flex-wrap justify-center gap-2 mt-5 max-w-2xl mx-auto px-4">
            {quickPrompts.map((item) => (
              <button
                key={item.label}
                onClick={() => submit({ message: item.prompt, files: [], pastedContent: [], model: "sonnet-4.5", isThinkingEnabled: false })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-300 bg-transparent border border-bg-300 rounded-full hover:bg-bg-200 hover:text-text-200 transition-colors duration-150"
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </div>

          <p className="text-xs text-text-500 mt-6 text-center">
            Coming soon — the AI assistant isn't connected to a live model yet.
          </p>
        </div>
      )}

      {hasMessages && (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-6">
            <div className="max-w-2xl mx-auto flex flex-col gap-4">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[80%] rounded-2xl rounded-br-md bg-accent text-bg-0 px-4 py-2.5 text-sm leading-relaxed"
                        : "max-w-[80%] rounded-2xl rounded-bl-md bg-bg-200 text-text-100 px-4 py-2.5 text-sm leading-relaxed"
                    }
                  >
                    {m.text}
                    {m.fileNames.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {m.fileNames.map((name) => (
                          <span key={name} className="text-[11px] px-1.5 py-0.5 rounded-full bg-black/10 dark:bg-white/10">
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isResponding && (
                <div className="flex justify-start animate-fade-in">
                  <div className="rounded-2xl rounded-bl-md bg-bg-200 px-4 py-3 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce [animation-delay:-0.2s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce [animation-delay:-0.1s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce" />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="px-4 pb-2 pt-1">
            <ClaudeChatInput onSendMessage={submit} placeholder="Ask your legal assistant anything..." />
            <p className="text-xs text-text-500 mt-3 text-center">
              Coming soon — the AI assistant isn't connected to a live model yet.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
