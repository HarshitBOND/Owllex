"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Conversation } from "./ai-chat-types"

const newChatId = () =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)

export function useAiConversations(userId: string | null | undefined) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string>(newChatId)
  const [loaded, setLoaded] = useState(false)
  const migrated = useRef(false)

  const refresh = useCallback(async () => {
    const res = await fetch("/api/ai/conversations")
    if (!res.ok) return
    const data = await res.json()
    setConversations(data.conversations ?? [])
  }, [])

  useEffect(() => {
    if (!userId || migrated.current) return
    migrated.current = true
    let cancelled = false

    const run = async () => {
      const key = `lexvert-ai-conversations-${userId}`
      const raw = localStorage.getItem(key)
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed) && parsed.length) {
            await fetch("/api/ai/conversations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ conversations: parsed.slice(0, 200) }),
            })
          }
        } catch {
          // corrupt local history is not worth blocking startup over
        }
        localStorage.removeItem(key)
      }
      if (cancelled) return
      await refresh()
      if (!cancelled) setLoaded(true)
    }

    run()
    return () => {
      cancelled = true
    }
  }, [userId, refresh])

  const startNewConversation = useCallback(() => setActiveId(newChatId()), [])

  const selectConversation = useCallback((id: string) => setActiveId(id), [])

  const deleteConversation = useCallback(
    async (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id))
      setActiveId((current) => (current === id ? newChatId() : current))
      await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" })
    },
    []
  )

  const renameConversation = useCallback(async (id: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c)))
    await fetch(`/api/ai/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    })
  }, [])

  return {
    conversations,
    activeId,
    loaded,
    refresh,
    startNewConversation,
    selectConversation,
    deleteConversation,
    renameConversation,
  }
}

export type UseAiConversationsReturn = ReturnType<typeof useAiConversations>
