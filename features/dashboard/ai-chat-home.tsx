"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  type FileUIPart,
  type UIDataTypes,
  type UIMessage,
  type UIMessagePart,
  type UITools,
} from "ai"
import { AlertTriangle, ArrowDown, Check, Gavel, Library, Search, Shuffle, Users } from "lucide-react"
import { AnswerCard } from "@/features/dashboard/answer/AnswerCard"
import {
  CLARIFY_TOOL,
  clarifyPartsOf,
  isClarifyPart,
  pendingClarify,
} from "@/features/dashboard/answer/ClarifyingQuestion"
import { sourcesOf, textOf as answerTextOf } from "@/features/dashboard/answer/answer-meta"
import {
  ClaudeChatInput,
  type ClaudeChatInputHandle,
  type ClaudeChatInputSubmission,
} from "@/components/ui/claude-style-chat-input"
import { DraftPanel, RevisionsPanel } from "./components/AiModePanels"
import { useAiChat } from "@/contexts/AiChatContext"
import { AiLimitNotice, parseAiLimitError } from "@/components/ui/ai-limit-notice"
import { useAllowedModels } from "@/hooks/useAllowedModels"

// Prompt starters. Clicking one loads it into the composer instead of sending it: every
// one of these needs the advocate's own facts (party, section, date, the document itself)
// before it is worth asking, and firing a bare fragment at the model is what used to
// produce answers about a judgment nobody had given it. They span the practice areas the
// assistant covers and rotate through "More ideas" so the list is not the same four chips.
type Starter = { label: string; prompt: string }

const STARTERS: Starter[] = [
  {
    label: "Summarise a judgment",
    prompt:
      "Summarise the attached judgment: facts, issues framed, the ratio, and how it can be used. Flag anything that is obiter.\n\n[Attach the judgment, or paste its text here]",
  },
  {
    label: "Review a contract clause",
    prompt:
      "Review this clause from my client's side. Set out the exposure it creates and give me replacement wording.\n\nParty I act for: [name]\n\n[Paste the clause here]",
  },
  {
    label: "Check limitation",
    prompt:
      "Work out whether this claim is within limitation, and if not, what can still save it.\n\nClaim: [suit for recovery on a written contract]\nCause of action arose: [DD-MM-YYYY]\nProposed filing: [DD-MM-YYYY]\nAcknowledgment or part payment since then: [details, if any]",
  },
  {
    label: "Draft a legal notice",
    prompt:
      "Draft a legal notice under Section 138 of the Negotiable Instruments Act, 1881.\n\nPayee: [name and address]\nDrawer: [name and address]\nCheque no. and date: [number], [DD-MM-YYYY]\nAmount: Rs [amount]\nDishonoured on: [DD-MM-YYYY]\nReason in the return memo: [funds insufficient]",
  },
  {
    label: "Draft a bail application",
    prompt:
      "Draft a regular bail application under Section 483 BNSS.\n\nAccused: [name]\nFIR no. and police station: [number], [PS]\nOffences: [sections]\nCourt: [court]\nIn custody since: [DD-MM-YYYY]\nGrounds I want pressed: [parity / no recovery to be made / delayed FIR]",
  },
  {
    label: "Draft a written statement",
    prompt:
      "Draft a written statement to the attached plaint, with preliminary objections and a paragraph-wise reply.\n\nDefendant: [name]\nDefences to run: [limitation / no privity / suit undervalued]\n\n[Attach the plaint]",
  },
  {
    label: "Reply to a show-cause notice",
    prompt:
      "Draft a reply to this show-cause notice.\n\nIssuing authority: [authority]\nNotice dated: [DD-MM-YYYY]\nAllegation: [what is alleged]\nOur position: [facts I want taken]\n\n[Attach the notice]",
  },
  {
    label: "Test writ maintainability",
    prompt:
      "Is a writ petition under Article 226 maintainable here? Deal with the alternative-remedy objection and the delay point.\n\nRespondent: [body or authority]\nGrievance: [order or action complained of]\nImpugned order dated: [DD-MM-YYYY]",
  },
  {
    label: "Maintenance claim",
    prompt:
      "Set out what maintenance is claimable and under which provisions, and what the court will look at.\n\nParties: [wife / minor child / parent]\nMarriage or relationship: [details]\nRespondent's income: [amount and source]\nExisting orders, if any: [details]",
  },
  {
    label: "Section 11 arbitration",
    prompt:
      "Advise on appointing an arbitrator under Section 11 of the Arbitration and Conciliation Act, 1996.\n\nArbitration clause: [paste the clause]\nNotice invoking arbitration served on: [DD-MM-YYYY]\nRespondent's reply: [details, if any]",
  },
  {
    label: "Consumer complaint",
    prompt:
      "Advise on a consumer complaint under the Consumer Protection Act, 2019: forum, pecuniary jurisdiction, limitation and reliefs.\n\nComplainant: [name]\nOpposite party: [name]\nDeficiency alleged: [what went wrong]\nAmount paid: Rs [amount] on [DD-MM-YYYY]",
  },
  {
    label: "IBC Section 9 application",
    prompt:
      "Walk through a Section 9 IBC application against an operational debtor, including the demand notice and the thresholds.\n\nOperational creditor: [name]\nCorporate debtor: [name]\nDebt: Rs [amount], due since [DD-MM-YYYY]\nDispute raised by the debtor: [details, if any]",
  },
  {
    label: "Reply to a GST notice",
    prompt:
      "Help me reply to this GST notice: the grounds available and how the reply should be structured.\n\nNotice under section: [section]\nPeriod: [FY]\nDemand: Rs [amount]\n\n[Attach the notice]",
  },
  {
    label: "Trademark objection",
    prompt:
      "Draft a reply to an examination report objecting under Section 11 of the Trade Marks Act, 1999.\n\nMark: [mark]\nClass: [class]\nCited marks: [marks]\nUse since: [DD-MM-YYYY]",
  },
  {
    label: "Plan a cross-examination",
    prompt:
      "Plan the cross-examination of [witness] in [case]. Give me the points to be extracted, the order to take them in, and the documents to confront the witness with.\n\n[Attach the examination-in-chief]",
  },
  {
    label: "My hearings this week",
    prompt: "List my hearings in the next seven days with case number, court, stage and what is listed for.",
  },
  {
    label: "Brief me on a matter",
    prompt:
      "Brief me on [case number or client name] from my files: parties, court, stage, what happened on the last date and what is due next.",
  },
  {
    label: "Draft an affidavit",
    prompt:
      "Draft an affidavit for [deponent name], [age], resident of [address], in support of [application] in [case number] before [court]. Facts to be deposed: [facts]",
  },
]

const STARTERS_PER_PAGE = 5

const TOOL_LABELS: Record<string, { running: string; done: string; icon: typeof Search }> = {
  searchPublicJudgments: { running: "Searching judgments and laws", done: "Searched judgments and laws", icon: Gavel },
  searchCases: { running: "Searching your cases", done: "Searched your cases", icon: Search },
  searchClients: { running: "Looking up your clients", done: "Looked up your clients", icon: Users },
  searchCorpusDocuments: { running: "Reading corpus documents", done: "Read corpus documents", icon: Library },
}

type ChatPart = UIMessagePart<UIDataTypes, UITools>

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

// Reasoning steps and tool calls share the collapsible thinking trail above the answer.
const renderThinkingPart = (part: ChatPart, key: string | number) => {
  if (part.type === "reasoning") {
    return (
      <p key={key} className="text-[13px] text-text-300 leading-relaxed py-1 whitespace-pre-wrap">
        {(part as any).text}
      </p>
    )
  }

  if (isToolUIPart(part)) {
    const name = getToolName(part)
    const meta = TOOL_LABELS[name] ?? { running: `Running ${name}`, done: `Ran ${name}`, icon: Search }
    const done = part.state === "output-available"
    const failed = part.state === "output-error"
    const Icon = meta.icon
    return (
      <div key={key} className="flex items-center gap-2 text-[13px] text-text-300 py-1">
        {failed ? (
          <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
        ) : done ? (
          <Check className="w-3.5 h-3.5 text-accent shrink-0" />
        ) : (
          <Icon className="w-3.5 h-3.5 animate-pulse shrink-0" />
        )}
        <span>
          {failed ? `Could not ${meta.running.toLowerCase()}` : done ? meta.done : `${meta.running}…`}
        </span>
      </div>
    )
  }

  return null
}

export function AiChatHome() {
  const { user } = useUser()
  const router = useRouter()
  const { activeId, conversations, loaded, refresh, corpora, activeCorpusId, setActiveCorpusId } = useAiChat()
  const reduceMotion = useReducedMotion()

  const [model, setModel] = useState<string>("fast")
  const allowedModels = useAllowedModels()
  const [atBottom, setAtBottom] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const composerRef = useRef<ClaudeChatInputHandle>(null)
  const [starterPage, setStarterPage] = useState(0)

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

  const { messages, sendMessage, setMessages, status, stop, regenerate, error, clearError, addToolResult } =
    useChat({
      id: activeId,
      transport,
      onFinish: () => refresh(),
      // Answering the question is the whole turn: the model asked and stopped,
      // so the answer has to go straight back without the advocate also having
      // to send something. Scoped to this one tool -- the retrieval tools run
      // server-side inside the same request and must never trigger a resend.
      sendAutomaticallyWhen: ({ messages: current }) => {
        if (answeredByTyping.current) return false
        const last = current[current.length - 1]
        if (!last || last.role !== "assistant") return false
        const asks = clarifyPartsOf(last)
        return asks.length > 0 && asks.every((part) => part.output !== undefined)
      },
    })

  const busy = status === "submitted" || status === "streaming"

  useEffect(() => {
    if (!messages.length) return
    cacheRef.current.set(activeId, { messages, partial: busy })
  }, [activeId, messages, busy])

  // Runs only when the conversation actually changes. Refreshing the sidebar list must
  // never reach in here and wipe a live thread.
  useEffect(() => {
    const id = activeId
    const cached = cacheRef.current.get(id)
    const known = conversationsRef.current.some((c) => c.id === id)

    setAtBottom(true)
    atBottomRef.current = true
    setMessages(cached ? cached.messages : [])

    // A locally created id that is not in the list is a brand new chat: nothing to load.
    if (!cached && loadedRef.current && !known) {
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
  }, [activeId, setMessages])

  useEffect(() => {
    if (!atBottomRef.current) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: busy ? "smooth" : "auto" })
  }, [messages, status, busy, loadingHistory])

  const visibleStarters = useMemo(() => {
    const offset = (starterPage * STARTERS_PER_PAGE) % STARTERS.length
    return Array.from(
      { length: Math.min(STARTERS_PER_PAGE, STARTERS.length) },
      (_, i) => STARTERS[(offset + i) % STARTERS.length]
    )
  }, [starterPage])

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 17) return "Good afternoon"
    return "Good evening"
  }, [])

  const submit = async (data: ClaudeChatInputSubmission) => {
    const text = data.message.trim()
    if (!text && data.files.length === 0 && data.pastedContent.length === 0) return

    if (data.mode?.id === "contract-review") {
      const params = new URLSearchParams()
      if (data.files[0]) params.set("file", data.files[0].file.name)
      router.push(`/contract-review${params.toString() ? `?${params.toString()}` : ""}`)
      return
    }

    if (data.model) setModel(data.model)

    const pasted = data.pastedContent.map((p) => `\n\n---\n${p.content}`).join("")
    const files: FileUIPart[] = await Promise.all(
      data.files.map(async (f) => ({
        type: "file" as const,
        mediaType: f.file.type || "application/octet-stream",
        filename: f.file.name,
        url: await readAsDataUrl(f.file),
      }))
    )

    // Typing is a legitimate way to answer a question card -- "or reply in the
    // message box". Settling the call with what they typed keeps the card in
    // step with the thread, and keeps the model from being owed a result it
    // never gets.
    const pending = pendingClarify(messages)
    if (pending && text) {
      answeredByTyping.current = true
      await addToolResult({
        tool: CLARIFY_TOOL,
        toolCallId: pending.toolCallId,
        output: { answer: text },
      })
    }

    setAtBottom(true)
    atBottomRef.current = true
    sendMessage({ text: text + pasted, files: files.length ? files : undefined })
  }

  const answerQuestion = (toolCallId: string, answer: string) => {
    answeredByTyping.current = false
    addToolResult({ tool: CLARIFY_TOOL, toolCallId, output: { answer } })
  }

  const skipQuestion = (toolCallId: string) => {
    answeredByTyping.current = false
    addToolResult({
      tool: CLARIFY_TOOL,
      toolCallId,
      output: { skipped: true, note: "The advocate skipped this. Answer on a stated assumption instead." },
    })
  }

  /**
   * Takes the thread back to before an answer and reloads the question that
   * produced it, so a badly-phrased prompt can be fixed instead of re-asked.
   */
  const editFrom = (assistantIndex: number) => {
    const userIndex = messages.slice(0, assistantIndex).map((m) => m.role).lastIndexOf("user")
    if (userIndex === -1) return
    const question = answerTextOf(messages[userIndex])
    setMessages(messages.slice(0, userIndex))
    composerRef.current?.setMessage(question)
  }

  const hasMessages = messages.length > 0
  const threadHasSources = useMemo(() => messages.some((m) => sourcesOf(m).length > 0), [messages])
  const showThread = hasMessages || loadingHistory
  const lastAssistantIndex = messages.map((m) => m.role).lastIndexOf("assistant")
  const spring = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 260, damping: 30 }

  // Drafting and picking up an unfinished document are the other two things
  // this screen is for, so they are tabs here rather than a trip to another
  // route and back.
  const [mode, setMode] = useState("assistant")

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {mode === "draft" && <DraftPanel />}
      {mode === "revisions" && <RevisionsPanel />}

      {mode === "assistant" && showThread && (
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget
            const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
            atBottomRef.current = bottom
            setAtBottom(bottom)
          }}
          className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-6"
        >
          <div className={`${threadHasSources ? "max-w-6xl" : "max-w-4xl"} mx-auto flex flex-col gap-5`}>
            {loadingHistory && !hasMessages && (
              <div className="flex flex-col gap-5 animate-pulse" aria-hidden>
                <div className="self-end h-10 w-2/5 rounded-2xl rounded-br-md bg-bg-200" />
                <div className="flex flex-col gap-2">
                  <div className="h-3.5 w-11/12 rounded bg-bg-200" />
                  <div className="h-3.5 w-4/5 rounded bg-bg-200" />
                  <div className="h-3.5 w-2/3 rounded bg-bg-200" />
                </div>
                <div className="self-end h-10 w-1/3 rounded-2xl rounded-br-md bg-bg-200" />
                <div className="flex flex-col gap-2">
                  <div className="h-3.5 w-10/12 rounded bg-bg-200" />
                  <div className="h-3.5 w-3/5 rounded bg-bg-200" />
                </div>
              </div>
            )}

            {messages.map((m, index) => {
              const textContent = m.parts
                .filter((p) => p.type === "text")
                .map((p: any) => p.text)
                .join("")

              if (m.role === "user") {
                return (
                  <motion.div
                    key={m.id}
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex gap-6"
                  >
                    <div className="flex-1 min-w-0 flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent/10 text-text-100 px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                        {textContent}
                        {m.parts.some((p) => p.type === "file") && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {m.parts
                              .filter((p) => p.type === "file")
                              .map((p: any, i) => (
                                <span key={i} className="text-[11px] px-1.5 py-0.5 rounded-full bg-text-100/10">
                                  {p.filename || "attachment"}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {threadHasSources && <div className="hidden lg:block w-60 shrink-0" aria-hidden />}
                  </motion.div>
                )
              }

              // The question is the turn, not a step on the way to it, so it
              // stays out of the collapsed trail and renders as its own card.
              const thinkingParts = m.parts.filter(
                (p) => p.type === "reasoning" || (isToolUIPart(p) && !isClarifyPart(p))
              ) as ChatPart[]
              const thinkingOpen = index === messages.length - 1 && busy && !textContent

              return (
                <AnswerCard
                  key={m.id}
                  message={m}
                  chatId={activeId}
                  streaming={busy && index === messages.length - 1}
                  thinkingParts={thinkingParts}
                  thinkingOpen={thinkingOpen}
                  renderThinkingPart={renderThinkingPart}
                  reduceMotion={reduceMotion}
                  reserveRail={threadHasSources}
                  onRegenerate={index === lastAssistantIndex ? () => regenerate() : undefined}
                  onEdit={index === lastAssistantIndex ? () => editFrom(index) : undefined}
                  onPickFollowUp={(q) => composerRef.current?.setMessage(q)}
                  onAnswerQuestion={answerQuestion}
                  onSkipQuestion={skipQuestion}
                />
              )
            })}

            {status === "submitted" && (
              <div className={`flex items-center gap-1.5 text-text-300 ${threadHasSources ? "lg:pr-[calc(15rem+1.5rem)]" : ""}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce [animation-delay:-0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce [animation-delay:-0.1s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-text-400 animate-bounce" />
                <span className="text-[13px] ml-1">Thinking…</span>
              </div>
            )}

            {error &&
              (() => {
                const limit = parseAiLimitError(error.message)
                if (limit) return <AiLimitNotice limit={limit} />
                return (
                  <div className={`flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 ${threadHasSources ? "lg:mr-[calc(15rem+1.5rem)]" : ""}`}>
                    <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                    <div className="flex-1 text-[13px] text-text-200">
                      <p className="font-medium text-text-100">Something went wrong</p>
                      <p className="text-text-300">{error.message || "The assistant couldn't respond."}</p>
                    </div>
                    <button
                      onClick={() => {
                        clearError()
                        regenerate()
                      }}
                      className="text-[13px] font-medium text-accent hover:underline shrink-0"
                    >
                      Retry
                    </button>
                  </div>
                )
              })()}
          </div>
        </div>
      )}

      {mode === "assistant" && showThread && !atBottom && (
        <button
          onClick={() => {
            atBottomRef.current = true
            setAtBottom(true)
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
          }}
          className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-0 border border-bg-300 shadow-md text-[13px] text-text-200 hover:bg-bg-200 transition-colors"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          Jump to latest
        </button>
      )}

      {mode === "assistant" && (
      <motion.div
        layout={!reduceMotion}
        transition={spring}
        className={
          showThread
            ? "shrink-0 px-4 pb-4 pt-2"
            : "flex-1 flex flex-col items-center justify-center px-4 py-8"
        }
      >
        <AnimatePresence mode="popLayout">
          {!showThread && (
            <motion.div
              key="hero"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
              transition={{ duration: 0.25 }}
              className="w-full max-w-4xl mb-8 text-center"
            >
              <div className="w-16 h-16 mx-auto mb-5 flex items-center justify-center rounded-2xl bg-accent/10">
                <Image src="/logo.png" alt="" width={32} height={32} className="w-8 h-8 object-contain" />
              </div>
              <h1 className="font-serif text-3xl sm:text-4xl font-light text-text-100 mb-2 tracking-tight">
                {greeting}, {user?.firstName || "Counselor"}
              </h1>
              <p className="text-text-300 text-sm sm:text-base">
                Ask about your cases, draft documents, or get quick legal guidance.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          layout={!reduceMotion}
          transition={spring}
          className={
            showThread && threadHasSources
              ? "w-full max-w-6xl mx-auto lg:pr-[calc(15rem+1.5rem)]"
              : "w-full"
          }
        >
          <ClaudeChatInput
            ref={composerRef}
            onSendMessage={submit}
            placeholder="Ask your legal assistant anything..."
            isGenerating={busy}
            onStop={stop}
            corpora={corpora}
            activeCorpusId={activeCorpusId}
            onSelectCorpus={setActiveCorpusId}
            allowedModels={allowedModels}
            defaultModel="fast"
          />
        </motion.div>

        <AnimatePresence>
          {!showThread && (
            <motion.div
              key="suggestions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-wrap justify-center gap-2 mt-5 max-w-4xl mx-auto"
            >
              {visibleStarters.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => composerRef.current?.setMessage(s.prompt)}
                  title="Adds this to the message box so you can fill in the details"
                  className="px-3 py-1.5 rounded-full border border-bg-300 text-text-300 text-xs sm:text-[13px] hover:bg-bg-200 hover:text-text-100 transition-colors"
                >
                  {s.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setStarterPage((p) => p + 1)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-text-400 text-xs sm:text-[13px] hover:text-text-100 hover:bg-bg-200 transition-colors"
                aria-label="Show other prompt suggestions"
              >
                <Shuffle className="w-3.5 h-3.5" />
                More ideas
              </button>

              <p className="w-full text-center text-[11px] text-text-400 mt-1">
                Suggestions fill the message box &mdash; add your facts, then send.
              </p>

              {corpora.length > 0 && (
                <div className="w-full flex flex-wrap justify-center items-center gap-2 mt-3">
                  <span className="text-[11px] text-text-400 uppercase tracking-wider">Corpus</span>
                  {corpora.slice(0, 4).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setActiveCorpusId(c.id === activeCorpusId ? null : c.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs sm:text-[13px] transition-colors ${
                        c.id === activeCorpusId
                          ? "border-accent/40 bg-accent/10 text-accent"
                          : "border-bg-300 text-text-300 hover:bg-bg-200 hover:text-text-100"
                      }`}
                    >
                      <Library className="w-3.5 h-3.5" />
                      {c.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => router.push("/corpus")}
                    className="px-3 py-1.5 rounded-full border border-dashed border-bg-300 text-text-400 text-xs sm:text-[13px] hover:text-text-100 hover:bg-bg-200 transition-colors"
                  >
                    All corpus
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      )}

      <div aria-live="polite" className="sr-only">
        {loadingHistory && "Loading conversation"}
        {status === "submitted" && "Assistant is thinking"}
        {status === "streaming" && "Assistant is responding"}
        {status === "ready" && hasMessages && "Response complete"}
      </div>
    </div>
  )
}
