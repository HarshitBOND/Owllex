"use client"

import { useRef, useState } from "react"
import type { Editor } from "@tiptap/react"
import DocumentEditorPanel from "./DocumentEditorPanel"
import AiAssistantPanel from "./AiAssistantPanel"
import {
  buildDocumentHtml,
  clauseVariants,
  generateAssistantReply,
  initialMessages,
  quickActions,
  type ChatMessage,
} from "../data"

const now = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

export default function DraftWorkspace() {
  const editorRef = useRef<Editor | null>(null)
  const clause5Ref = useRef(clauseVariants.standard)
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [isThinking, setIsThinking] = useState(false)

  const applyClause = (html: string) => {
    clause5Ref.current = html
    editorRef.current?.commands.setContent(buildDocumentHtml(html))
  }

  const handleSend = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: trimmed, time: now() }])
    setIsThinking(true)

    setTimeout(() => {
      const reply = generateAssistantReply(trimmed, clause5Ref.current)
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: reply.replyText, time: now(), clauseHtml: reply.clauseHtml },
      ])
      if (reply.newClause5) applyClause(reply.newClause5)
      setIsThinking(false)
    }, 700)
  }

  return (
    <div className="h-full flex flex-col lg:flex-row gap-3 md:gap-4">
      <DocumentEditorPanel
        initialContent={buildDocumentHtml(clause5Ref.current)}
        onEditorReady={(editor) => {
          editorRef.current = editor
        }}
      />
      <AiAssistantPanel messages={messages} isThinking={isThinking} quickActions={quickActions} onSend={handleSend} />
    </div>
  )
}
