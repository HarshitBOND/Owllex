"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSidebar } from "@/contexts/SidebarContext"
import { useAiChat } from "@/contexts/AiChatContext"
import { AiChatHistoryPanel } from "@/features/dashboard/ai-chat-history-panel"

export function AiChatHistoryFlyout() {
  const router = useRouter()
  const { isOpen: isSidebarOpen } = useSidebar()
  const {
    isHistoryOpen,
    closeHistory,
    conversations,
    activeId,
    startNewConversation,
    selectConversation,
    renameConversation,
    deleteConversation,
  } = useAiChat()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isHistoryOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        closeHistory()
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeHistory()
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [isHistoryOpen, closeHistory])

  if (!isHistoryOpen) return null

  return (
    <div className="fixed inset-0 z-[300]">
      <div className="absolute inset-0 bg-black/30" />
      <div
        ref={panelRef}
        className={cn(
          "absolute top-4 bottom-4 left-4 w-[300px] max-w-[calc(100vw-2rem)] bg-bg-100 border border-bg-300 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-fade-in",
          isSidebarOpen ? "lg:left-52" : "lg:left-16"
        )}
      >
        <div className="flex items-center justify-between px-3 pt-3">
          <p className="text-sm font-semibold text-text-100 px-1">Chat History</p>
          <button
            onClick={closeHistory}
            aria-label="Close chat history"
            className="p-1.5 rounded-lg text-text-400 hover:text-text-100 hover:bg-bg-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <AiChatHistoryPanel
            conversations={conversations}
            activeId={activeId}
            onNewChat={() => {
              startNewConversation()
              closeHistory()
              router.push("/dashboard")
            }}
            onSelect={(id) => {
              selectConversation(id)
              closeHistory()
              router.push("/dashboard")
            }}
            onRename={renameConversation}
            onDelete={deleteConversation}
          />
        </div>
      </div>
    </div>
  )
}
