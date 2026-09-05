"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { useUser } from "@clerk/nextjs"
import { useAiConversations, type UseAiConversationsReturn } from "@/features/dashboard/use-ai-conversations"
import { useChatEngine, type ChatEngine } from "@/features/dashboard/use-chat-engine"
import { useCorpora } from "@/features/corpus/hooks/useCorpora"
import type { CorpusSummary } from "@/features/corpus/types"

interface AiChatContextValue extends UseAiConversationsReturn {
  isHistoryOpen: boolean
  openHistory: () => void
  closeHistory: () => void
  toggleHistory: () => void
  corpora: CorpusSummary[]
  refreshCorpora: () => Promise<void>
  activeCorpus: CorpusSummary | null
  activeCorpusId: string | null
  setActiveCorpusId: (id: string | null) => void
}

const AiChatContext = createContext<AiChatContextValue | undefined>(undefined)

/**
 * The live thread, kept in its own context on purpose.
 *
 * Its value changes on every streamed token. Putting it in the context above
 * would re-render the sidebar, the corpus pickers and every other consumer of
 * useAiChat for each chunk, so only the components that actually render the
 * conversation subscribe here.
 */
const AiChatEngineContext = createContext<ChatEngine | undefined>(undefined)

export function AiChatProvider({ children }: { children: ReactNode }) {
  const { user } = useUser()
  const conv = useAiConversations(user?.id)
  const { corpora, refresh: refreshCorpora } = useCorpora(!!user?.id)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [activeCorpusId, setActiveCorpusId] = useState<string | null>(null)

  const openHistory = useCallback(() => setIsHistoryOpen(true), [])
  const closeHistory = useCallback(() => setIsHistoryOpen(false), [])
  const toggleHistory = useCallback(() => setIsHistoryOpen((open) => !open), [])

  // A fresh object here re-renders every consumer (including the live chat thread) on
  // any unrelated state change, so keep the identity stable.
  const value = useMemo<AiChatContextValue>(
    () => ({
      ...conv,
      isHistoryOpen,
      openHistory,
      closeHistory,
      toggleHistory,
      corpora,
      refreshCorpora,
      activeCorpus: corpora.find((c) => c.id === activeCorpusId) ?? null,
      activeCorpusId,
      setActiveCorpusId,
    }),
    [conv, isHistoryOpen, openHistory, closeHistory, toggleHistory, corpora, refreshCorpora, activeCorpusId]
  )

  return (
    <AiChatContext.Provider value={value}>
      <AiChatEngineProvider>{children}</AiChatEngineProvider>
    </AiChatContext.Provider>
  )
}

/**
 * Owns the conversation itself, below the context it reads from.
 *
 * Nested rather than merged so that useChatEngine can take what it needs from
 * useAiChat, and so a token arriving mid-stream re-renders only this subtree's
 * thread consumers.
 */
function AiChatEngineProvider({ children }: { children: ReactNode }) {
  const { user } = useUser()
  const { activeId, conversations, loaded, refresh, activeCorpusId, setActiveCorpusId, refreshCorpora } = useAiChat()

  const engine = useChatEngine({
    activeId,
    conversations,
    loaded,
    refresh,
    activeCorpusId,
    setActiveCorpusId,
    refreshCorpora,
    enabled: !!user?.id,
  })

  return <AiChatEngineContext.Provider value={engine}>{children}</AiChatEngineContext.Provider>
}

export function useAiChat() {
  const ctx = useContext(AiChatContext)
  if (!ctx) throw new Error("useAiChat must be used within an AiChatProvider")
  return ctx
}

/** The live conversation. Only for components that render or drive the thread. */
export function useChatThread() {
  const ctx = useContext(AiChatEngineContext)
  if (!ctx) throw new Error("useChatThread must be used within an AiChatProvider")
  return ctx
}
