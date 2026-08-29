"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ChatMessage, Conversation } from "./ai-chat-types"

const createId = () => Math.random().toString(36).slice(2, 10)

const deriveTitle = (text: string, fallback: string) => {
  const trimmed = text.trim().replace(/\s+/g, " ")
  if (!trimmed) return fallback
  return trimmed.length > 48 ? trimmed.slice(0, 48) + "…" : trimmed
}

const storageKeyFor = (userId: string) => `lexvert-ai-conversations-${userId}`

export function useAiConversations(userId: string | null | undefined) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const storageKey = userId ? storageKeyFor(userId) : null

  useEffect(() => {
    setLoaded(false)
    if (!storageKey) return
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as Conversation[]
        setConversations(Array.isArray(parsed) ? parsed : [])
      } else {
        setConversations([])
      }
    } catch {
      setConversations([])
    }
    setActiveId(null)
    setLoaded(true)
  }, [storageKey])

  useEffect(() => {
    if (!storageKey || !loaded) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(conversations))
    } catch {
      // ignore storage failures (private mode, quota, etc.)
    }
  }, [conversations, storageKey, loaded])

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  )

  const messages = activeConversation?.messages ?? []

  const startNewConversation = useCallback(() => {
    setActiveId(null)
  }, [])

  const selectConversation = useCallback((id: string) => {
    setActiveId(id)
  }, [])

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id))
    setActiveId((current) => (current === id ? null : current))
  }, [])

  const renameConversation = useCallback((id: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c))
    )
  }, [])

  const addUserMessage = useCallback(
    (text: string, fileNames: string[]): string => {
      const message: ChatMessage = { id: createId(), role: "user", text, fileNames }
      let targetId = activeId

      setConversations((prev) => {
        if (targetId) {
          return prev.map((c) =>
            c.id === targetId
              ? { ...c, messages: [...c.messages, message], updatedAt: Date.now() }
              : c
          )
        }
        const conv: Conversation = {
          id: createId(),
          title: deriveTitle(text, fileNames[0] || "New conversation"),
          messages: [message],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        targetId = conv.id
        return [conv, ...prev]
      })

      if (targetId !== activeId) setActiveId(targetId)
      return targetId!
    },
    [activeId]
  )

  const addAssistantMessage = useCallback((conversationId: string, text: string) => {
    const message: ChatMessage = { id: createId(), role: "assistant", text, fileNames: [] }
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? { ...c, messages: [...c.messages, message], updatedAt: Date.now() }
          : c
      )
    )
  }, [])

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations]
  )

  return {
    conversations: sortedConversations,
    activeId,
    activeConversation,
    messages,
    startNewConversation,
    selectConversation,
    deleteConversation,
    renameConversation,
    addUserMessage,
    addAssistantMessage,
  }
}

export type UseAiConversationsReturn = ReturnType<typeof useAiConversations>
