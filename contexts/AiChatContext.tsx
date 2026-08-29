"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { useUser } from "@clerk/nextjs"
import { useAiConversations, type UseAiConversationsReturn } from "@/features/dashboard/use-ai-conversations"

interface AiChatContextValue extends UseAiConversationsReturn {
  isHistoryOpen: boolean
  openHistory: () => void
  closeHistory: () => void
}

const AiChatContext = createContext<AiChatContextValue | undefined>(undefined)

export function AiChatProvider({ children }: { children: ReactNode }) {
  const { user } = useUser()
  const conv = useAiConversations(user?.id)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)

  const value: AiChatContextValue = {
    ...conv,
    isHistoryOpen,
    openHistory: () => setIsHistoryOpen(true),
    closeHistory: () => setIsHistoryOpen(false),
  }

  return <AiChatContext.Provider value={value}>{children}</AiChatContext.Provider>
}

export function useAiChat() {
  const ctx = useContext(AiChatContext)
  if (!ctx) throw new Error("useAiChat must be used within an AiChatProvider")
  return ctx
}
