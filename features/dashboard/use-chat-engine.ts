"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { CLARIFY_TOOL, clarifyPartsOf, pendingClarify } from "@/components/ai/ClarifyingQuestion"
import { ACTION_TOOL, actionPartsOf, pendingAction } from "@/features/dashboard/answer/ActionProposal"
import { runAction } from "@/features/dashboard/answer/actions/registry"
import type { AgentAction } from "@/lib/ai/actions"

/**
 * The chat itself, held above any one page.
 *
 * It used to live inside the chat screen, which was fine while answering was
 * all it did. Now that approving a step can take the advocate to the document
 * editor or the workflow canvas, a thread tied to one route would end at the
 * moment it became most useful -- the assistant would propose drafting, do it,
 * and then have nowhere to say what came next. Owning the conversation here
 * lets the same thread carry on wherever the advocate has been taken.
 */
export type ChatEngine = ReturnType<typeof useChatEngine>

export function useChatEngine(opts: {
  activeId: string
  conversations: { id: string }[]
  loaded: boolean
  refresh: () => void
  activeCorpusId: string | null
  setActiveCorpusId: (id: string | null) => void
  refreshCorpora: () => Promise<void>
  /** False before sign-in, where there is no history to fetch. */
  enabled: boolean
}) {
  const { activeId, conversations, loaded, refresh, activeCorpusId, setActiveCorpusId, refreshCorpora, enabled } = opts
  const router = useRouter()

  const [model, setModel] = useState<string>("fast")
  const [loadingHistory, setLoadingHistory] = useState(false)

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

  // Set when a typed message is what settles a pending question, so the turn
  // goes out as that message rather than as a bare auto-continuation.
  const answeredByTyping = useRef(false)

  const chat = useChat({
    id: activeId,
    transport,
    onFinish: () => refresh(),
    sendAutomaticallyWhen: ({ messages: current }) => {
      if (answeredByTyping.current) return false
      const last = current[current.length - 1]
      if (!last || last.role !== "assistant") return false
      // Both halting tools resume the same way: the model put something to the
      // advocate and stopped, so their decision -- an answer, or an action
      // taken or declined -- has to go straight back without them also having
      // to send a message. Scoped to these two: the retrieval tools run
      // server-side inside the same request and must never trigger a resend.
      const halts = [...clarifyPartsOf(last), ...actionPartsOf(last)]
      return halts.length > 0 && halts.every((part) => part.output !== undefined)
    },
  })

  const { messages, setMessages, status, error, addToolResult } = chat
  const busy = status === "submitted" || status === "streaming"

  useEffect(() => {
    if (!messages.length) return
    cacheRef.current.set(activeId, { messages, partial: busy })
  }, [activeId, messages, busy])

  // Runs only when the conversation actually changes. Refreshing the sidebar list must
  // never reach in here and wipe a live thread.
  useEffect(() => {
    // Now that this lives in the root layout it runs on every page, signed-out
    // marketing and auth screens included -- where the fetch below is a
    // guaranteed 401.
    if (!enabled) return

    const id = activeId
    const cached = cacheRef.current.get(id)
    const known = conversationsRef.current.some((c) => c.id === id)

    setMessages(cached ? cached.messages : [])

    // The conversation list hasn't loaded yet, so there's no way to tell a
    // brand new id from one that already has history on the server. Wait for
    // it rather than guessing -- the effect reruns once `loaded` flips.
    if (!cached && !loadedRef.current) {
      setLoadingHistory(false)
      return
    }
    // A locally created id that is not in the list is a brand new chat: nothing to load.
    if (!cached && !known) {
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
  }, [activeId, setMessages, enabled, loaded])

  const answerQuestion = useCallback(
    (toolCallId: string, answer: string) => {
      answeredByTyping.current = false
      addToolResult({ tool: CLARIFY_TOOL, toolCallId, output: { answer } })
    },
    [addToolResult]
  )

  const skipQuestion = useCallback(
    (toolCallId: string) => {
      answeredByTyping.current = false
      addToolResult({
        tool: CLARIFY_TOOL,
        toolCallId,
        output: { skipped: true, note: "The advocate skipped this. Answer on a stated assumption instead." },
      })
    },
    [addToolResult]
  )

  /**
   * Carries out an action the advocate approved, then hands the outcome back to
   * the model so it can propose the step after it.
   *
   * The result is written even when the action failed: leaving the call
   * unanswered would strand the turn, and a model told plainly that something
   * did not work can say so instead of pretending it did.
   */
  const approveAction = useCallback(
    async (toolCallId: string, action: AgentAction) => {
      answeredByTyping.current = false
      const result = await runAction(action, { router, activeCorpusId, setActiveCorpusId, refreshCorpora })
      await addToolResult({
        tool: ACTION_TOOL,
        toolCallId,
        output: result.ok
          ? { approved: true, summary: result.summary, data: result.data }
          : { approved: false, note: result.summary },
      })
    },
    [addToolResult, router, activeCorpusId, setActiveCorpusId, refreshCorpora]
  )

  const declineAction = useCallback(
    (toolCallId: string) => {
      answeredByTyping.current = false
      addToolResult({
        tool: ACTION_TOOL,
        toolCallId,
        output: {
          approved: false,
          note: "The advocate declined this step. Carry on without it and don't offer it again unless asked.",
        },
      })
    },
    [addToolResult]
  )

  /**
   * Closes off anything the model is still owed before a typed message goes out.
   *
   * Typing is a legitimate way to answer a question card -- "or reply in the
   * message box" -- and equally a way to pass over a proposed step. Settling the
   * call keeps the card in step with the thread, and keeps the model from being
   * owed a result it never gets.
   */
  const settleBeforeSend = useCallback(
    async (text: string) => {
      if (!text) return

      const question = pendingClarify(messages)
      if (question) {
        answeredByTyping.current = true
        await addToolResult({ tool: CLARIFY_TOOL, toolCallId: question.toolCallId, output: { answer: text } })
      }

      const proposal = pendingAction(messages)
      if (proposal) {
        answeredByTyping.current = true
        await addToolResult({
          tool: ACTION_TOOL,
          toolCallId: proposal.toolCallId,
          output: { approved: false, note: "The advocate moved on rather than taking this step." },
        })
      }
    },
    [messages, addToolResult]
  )

  // Memoized so a context value that only actually changes with the thread
  // itself doesn't also invalidate every consumer on renders caused by
  // something else entirely -- this hook now lives above every page, not just
  // the chat screen, so an unstable value here would ripple everywhere.
  // `chat` itself is a fresh object every render (the SDK returns a new
  // wrapper each time), so its individual fields are the real dependencies --
  // depending on `chat` as a whole would defeat the memo entirely.
  return useMemo(
    () => ({
      ...chat,
      busy,
      model,
      setModel,
      loadingHistory,
      answerQuestion,
      skipQuestion,
      approveAction,
      declineAction,
      settleBeforeSend,
    }),
    [
      chat.id,
      messages,
      setMessages,
      chat.sendMessage,
      chat.regenerate,
      chat.clearError,
      chat.stop,
      chat.resumeStream,
      addToolResult,
      chat.addToolOutput,
      status,
      error,
      busy,
      model,
      setModel,
      loadingHistory,
      answerQuestion,
      skipQuestion,
      approveAction,
      declineAction,
      settleBeforeSend,
    ]
  )
}
