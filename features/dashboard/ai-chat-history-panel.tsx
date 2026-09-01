"use client"

import { useMemo, useState } from "react"
import { Plus, Search, Pencil, Trash2, Check, X, MessageSquare, PanelLeftClose } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Conversation } from "./ai-chat-types"

function groupConversations(conversations: Conversation[]) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 86400000
  const startOfWeek = startOfToday - 7 * 86400000

  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 Days", items: [] },
    { label: "Older", items: [] },
  ]

  for (const c of conversations) {
    if (c.updatedAt >= startOfToday) groups[0].items.push(c)
    else if (c.updatedAt >= startOfYesterday) groups[1].items.push(c)
    else if (c.updatedAt >= startOfWeek) groups[2].items.push(c)
    else groups[3].items.push(c)
  }

  return groups.filter((g) => g.items.length > 0)
}

interface AiChatHistoryPanelProps {
  conversations: Conversation[]
  activeId: string | null
  onNewChat: () => void
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onCollapse?: () => void
}

export function AiChatHistoryPanel({
  conversations,
  activeId,
  onNewChat,
  onSelect,
  onRename,
  onDelete,
  onCollapse,
}: AiChatHistoryPanelProps) {
  const [query, setQuery] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return conversations
    const q = query.trim().toLowerCase()
    return conversations.filter((c) => c.title.toLowerCase().includes(q))
  }, [conversations, query])

  const groups = useMemo(() => groupConversations(filtered), [filtered])

  const startRename = (c: Conversation) => {
    setEditingId(c.id)
    setDraftTitle(c.title)
  }

  const commitRename = (id: string) => {
    if (draftTitle.trim()) onRename(id, draftTitle)
    setEditingId(null)
  }

  return (
    <div className="flex flex-col h-full w-full bg-bg-100">
      <div className="flex items-center gap-1.5 px-2.5 pt-3 pb-2">
        <button
          onClick={onNewChat}
          className="flex-1 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-text-100 bg-bg-0 border border-bg-300 hover:bg-bg-200 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New chat
        </button>
        {onCollapse && (
          <button
            onClick={onCollapse}
            aria-label="Collapse history"
            className="inline-flex items-center justify-center h-9 w-9 rounded-xl text-text-400 hover:text-text-200 hover:bg-bg-200 transition-colors"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="px-2.5 pb-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-text-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats..."
            className="w-full h-8 pl-8 pr-2 rounded-lg bg-bg-0 border border-bg-300 text-xs text-text-100 placeholder:text-text-400 outline-none focus:border-text-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-3">
        {groups.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center px-4 py-10 text-text-400">
            <MessageSquare className="w-6 h-6 mb-2 opacity-60" />
            <p className="text-xs">{query ? "No chats match your search" : "No conversations yet"}</p>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            <p className="text-[10px] font-semibold text-text-400 uppercase tracking-wider px-2 mb-1">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((c) => {
                const isActive = c.id === activeId
                const isEditing = editingId === c.id
                const isConfirmingDelete = confirmDeleteId === c.id
                return (
                  <div
                    key={c.id}
                    onClick={() => !isEditing && !isConfirmingDelete && onSelect(c.id)}
                    className={cn(
                      "group flex items-center gap-1.5 rounded-lg px-2 py-2 cursor-pointer transition-colors",
                      isActive ? "bg-accent/10 text-accent" : "text-text-200 hover:bg-bg-200"
                    )}
                  >
                    {isConfirmingDelete ? (
                      <>
                        <span className="flex-1 min-w-0 truncate text-xs text-text-300">Delete this chat?</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmDeleteId(null)
                            onDelete(c.id)
                          }}
                          className="px-1.5 py-0.5 rounded text-[11px] font-medium text-red-500 hover:bg-red-500/10"
                        >
                          Delete
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmDeleteId(null)
                          }}
                          className="px-1.5 py-0.5 rounded text-[11px] font-medium text-text-400 hover:text-text-100 hover:bg-bg-0"
                        >
                          Cancel
                        </button>
                      </>
                    ) : isEditing ? (
                      <>
                        <input
                          autoFocus
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename(c.id)
                            if (e.key === "Escape") setEditingId(null)
                          }}
                          className="flex-1 min-w-0 h-6 px-1.5 rounded bg-bg-0 border border-bg-300 text-xs text-text-100 outline-none"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            commitRename(c.id)
                          }}
                          className="p-1 rounded text-text-300 hover:text-accent hover:bg-bg-0"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingId(null)
                          }}
                          className="p-1 rounded text-text-300 hover:text-text-100 hover:bg-bg-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 min-w-0 truncate text-xs font-medium">{c.title}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            startRename(c)
                          }}
                          className="p-1 rounded text-text-400 hover:text-text-100 hover:bg-bg-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Rename chat"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmDeleteId(c.id)
                          }}
                          className="p-1 rounded text-text-400 hover:text-red-500 hover:bg-bg-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Delete chat"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
