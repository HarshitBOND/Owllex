"use client"

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import type { UIMessage } from "ai"
import { toast } from "sonner"
import ChatReasoning from "@/components/ui/chat-reasoning"
import { AnswerBody } from "./AnswerBody"
import { AnswerActions, type Feedback } from "./AnswerActions"
import { FollowUps } from "./FollowUps"
import { SourcesDisclosure, SourcesRail, sourceRowId } from "./SourcesRail"
import { ClarifyingQuestion, clarifyPartsOf } from "@/components/ai/ClarifyingQuestion"
import { ActionProposal, actionPartsOf } from "./ActionProposal"
import { WorkCard } from "./WorkCard"
import { formatAnswerDate, metaOf, sourcesOf, textOf, titleOf, verifiedOf } from "./answer-meta"
import { BadgeCheck } from "lucide-react"
import type { AgentAction } from "@/lib/ai/actions"

/**
 * One assistant turn, presented as a document rather than a chat bubble: what
 * the answer is called, what it was built from, and what can be done with it.
 */
export function AnswerCard({
  message,
  chatId,
  streaming,
  thinkingParts,
  thinkingOpen,
  renderThinkingPart,
  reduceMotion,
  reserveRail,
  onRegenerate,
  onEdit,
  onPickFollowUp,
  onAnswerQuestion,
  onSkipQuestion,
  onApproveAction,
  onDeclineAction,
}: {
  message: UIMessage
  chatId: string
  streaming: boolean
  thinkingParts: any[]
  thinkingOpen: boolean
  renderThinkingPart: (part: any, key: string | number) => React.ReactNode
  reduceMotion: boolean | null
  /** Keep the rail gutter even for an answer with no sources, so the answer
   *  column does not change width from one turn to the next. */
  reserveRail: boolean
  onRegenerate?: () => void
  onEdit?: () => void
  onPickFollowUp: (question: string) => void
  onAnswerQuestion: (toolCallId: string, answer: string) => void
  onSkipQuestion: (toolCallId: string) => void
  onApproveAction: (toolCallId: string, action: AgentAction) => Promise<void>
  onDeclineAction: (toolCallId: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [activeN, setActiveN] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(((message as any).feedback as Feedback) ?? null)

  const text = textOf(message)
  const sources = sourcesOf(message)
  const meta = metaOf(message)
  const verified = verifiedOf(message)
  // Once a question is answered it has nothing left to say -- the answer that
  // follows speaks for it. Keeping it around would just be a Q&A card trailing
  // behind every turn that needed to ask something first.
  const questions = clarifyPartsOf(message).filter((p) => p.output === undefined)
  const proposals = actionPartsOf(message)
  const title = useMemo(() => titleOf(message), [message])
  const created = useMemo(
    () => formatAnswerDate((message as any).createdAt ? new Date((message as any).createdAt) : new Date()),
    [message]
  )

  const selectSource = (n: number) => {
    setActiveN(n)
    const source = sources.find((s) => s.n === n)
    if (!source) return
    const row =
      document.getElementById(sourceRowId(message.id, source.title)) ??
      document.getElementById(`m-${sourceRowId(message.id, source.title)}`)
    row?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const rate = async (value: Feedback) => {
    const previous = feedback
    setFeedback(value)
    try {
      const res = await fetch(`/api/ai/conversations/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.id, feedback: value }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setFeedback(previous)
      toast.error("Couldn't save that rating.")
    }
  }

  const download = async (format: "pdf" | "docx") => {
    setExporting(true)
    try {
      const res = await fetch(
        `/api/ai/conversations/${chatId}/export?format=${format}&messageId=${encodeURIComponent(message.id)}`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `Export failed (${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${title.replace(/[^\w\s-]+/g, "").trim().slice(0, 60) || "answer"}.${format}`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't export that answer.")
    }
    setExporting(false)
  }

  // A turn that only asked a question, now answered, has nothing left to show.
  if (!text && !questions.length && !proposals.length && !thinkingParts.length) return null

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex gap-6"
    >
      <div className="flex-1 min-w-0">
        {thinkingParts.length > 0 && (
          <ChatReasoning
            partsInAccordion={thinkingParts}
            defaultValue={thinkingOpen ? "reasoning" : undefined}
            renderMessagePart={renderThinkingPart}
            className="[&>div]:border-b-0 mb-2"
          />
        )}

        {text && (
          <article className="rounded-2xl border border-bg-300 bg-bg-100/40 p-4 sm:p-5">
            <header className="mb-3">
              <h2 className="font-serif text-lg sm:text-xl text-text-100 leading-snug">{title}</h2>
              <p className="mt-1 text-[12px] text-text-400">
                Answer
                {sources.length > 0 && ` · ${sources.length} ${sources.length === 1 ? "source" : "sources"}`}
                {` · ${created}`}
              </p>
              {verified !== null && (
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium mt-2 ${
                    verified
                      ? "bg-brand-500/10 text-brand-600 border border-brand-500/20"
                      : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                  }`}
                >
                  <BadgeCheck className="w-3.5 h-3.5" />
                  {verified ? "Citations verified" : "Verification incomplete — check citations before relying on them"}
                </div>
              )}
            </header>

            <AnswerBody text={text} sources={sources} onSelectSource={selectSource} />

            {sources.length > 0 && (
              <div className="mt-4">
                <SourcesDisclosure messageId={message.id} sources={sources} activeN={activeN} />
              </div>
            )}

            {!streaming && (
              <>
                <div className="mt-4 pt-3 border-t border-bg-300">
                  <AnswerActions
                    feedback={feedback}
                    onFeedback={rate}
                    copied={copied}
                    onCopy={copy}
                    exporting={exporting}
                    onExport={download}
                    onRegenerate={onRegenerate}
                    onEdit={onEdit}
                  />
                </div>
                <FollowUps questions={meta.followUps ?? []} onPick={onPickFollowUp} />
              </>
            )}
          </article>
        )}

        {/* Outside the article on purpose: a turn that only asks a question has
            no answer text, and the card would otherwise have nothing to sit in. */}
        {questions.map((part) =>
          part.input?.question ? (
            <div key={part.toolCallId} className={text ? "mt-3" : undefined}>
              <ClarifyingQuestion
                question={part.input.question}
                options={part.input.options}
                allowFreeText={part.input.allowFreeText}
                disabled={streaming}
                onAnswer={(answer) => onAnswerQuestion(part.toolCallId, answer)}
                onSkip={() => onSkipQuestion(part.toolCallId)}
              />
            </div>
          ) : null
        )}

        {/* Outside the article for the same reason as the questions above: a
            turn that only proposes a step has no answer text to sit inside. */}
        {proposals.map((part) =>
          part.input?.action && part.input.label && part.input.rationale ? (
            <div key={part.toolCallId} className={text || questions.length ? "mt-3" : undefined}>
              <ActionProposal
                label={part.input.label}
                rationale={part.input.rationale}
                action={part.input.action as AgentAction}
                output={part.output}
                disabled={streaming}
                onApprove={(action) => onApproveAction(part.toolCallId, action)}
                onDecline={() => onDeclineAction(part.toolCallId)}
              />
              {/* The document the advocate was taken away to write, kept
                  reachable from the thread that decided to write it. */}
              {part.output?.approved && typeof (part.output as any).data?.draftId === "string" && (
                <div className="mt-2">
                  <WorkCard
                    draftId={(part.output as any).data.draftId}
                    title={String((part.output as any).data.title ?? "Document")}
                  />
                </div>
              )}
            </div>
          ) : null
        )}
      </div>

      {sources.length > 0 ? (
        <SourcesRail messageId={message.id} sources={sources} activeN={activeN} />
      ) : (
        reserveRail && <div className="hidden lg:block w-60 shrink-0" aria-hidden />
      )}
    </motion.div>
  )
}
