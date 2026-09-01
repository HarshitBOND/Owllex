"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { useUser } from "@clerk/nextjs"
import { useAiConversations, type UseAiConversationsReturn } from "@/features/dashboard/use-ai-conversations"
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

  return <AiChatContext.Provider value={value}>{children}</AiChatContext.Provider>
}

export function useAiChat() {
  const ctx = useContext(AiChatContext)
  if (!ctx) throw new Error("useAiChat must be used within an AiChatProvider")
  return ctx
}
