"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { AlertTriangle, BadgeCheck, Check, FileText, Library, Loader2, Search, Sparkles } from "lucide-react"
import { AiLimitNotice, parseAiLimitError } from "@/components/ui/ai-limit-notice"
import { useCorpora } from "@/features/corpus/hooks/useCorpora"
import { markdownComponents as answerMarkdownComponents } from "@/features/dashboard/answer/AnswerBody"

const STAGES = [
  { id: "understanding", label: "Understanding the question" },
  { id: "searching", label: "Searching your corpus and cases" },
  { id: "drafting", label: "Drafting with citations" },
  { id: "verifying", label: "Verifying every citation" },
  { id: "rewriting", label: "Fixing flagged claims" },
  { id: "done", label: "Done" },
]

type Source = { n: number; title: string; url: string | null }

export default function DeepResearch() {
  const { corpora } = useCorpora()
  const [query, setQuery] = useState("")
  const [corpusId, setCorpusId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState<string | null>(null)
  const [reachedStages, setReachedStages] = useState<string[]>([])
  const [answer, setAnswer] = useState("")
  const [sources, setSources] = useState<Source[]>([])
  const [verified, setVerified] = useState<boolean | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [runsInfo, setRunsInfo] = useState<{ used: number; limit: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch("/api/userdetails/ai-usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.deepResearch) setRunsInfo(d.deepResearch)
      })
      .catch(() => {})
  }, [running])

  const run = async () => {
    const q = query.trim()
    if (!q || running) return

    setRunning(true)
    setStage(null)
    setReachedStages([])
    setAnswer("")
    setSources([])
    setVerified(null)
    setErrorMessage(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch("/api/ai/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, corpusId }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        setErrorMessage(await res.text().catch(() => "Deep Research failed."))
        setRunning(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const payload = line.slice(6).trim()
          if (payload === "[DONE]") continue
          let chunk: any
          try {
            chunk = JSON.parse(payload)
          } catch {
            continue
          }
          if (chunk.type === "data-stage") {
            setStage(chunk.data.stage)
            setReachedStages((prev) => (prev.includes(chunk.data.stage) ? prev : [...prev, chunk.data.stage]))
          } else if (chunk.type === "data-sources") {
            setSources(chunk.data.sources ?? [])
          } else if (chunk.type === "data-verified") {
            setVerified(!!chunk.data.verified)
          } else if (chunk.type === "text-delta") {
            setAnswer((prev) => prev + (chunk.delta ?? ""))
          } else if (chunk.type === "error") {
            setErrorMessage(chunk.errorText || "Deep Research failed.")
          }
        }
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setErrorMessage("Deep Research failed. Please try again.")
      }
    }
    setRunning(false)
  }

  const limit = parseAiLimitError(errorMessage ?? undefined)
  const outOfRuns = runsInfo !== null && runsInfo.used >= runsInfo.limit

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5">
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-border shadow-sm p-4">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask a research question about this matter e.g. 'What is our strongest ground to resist the injunction, based on the pleadings on file?'"
          rows={3}
          className="w-full bg-transparent resize-none text-sm text-text-100 dark:text-foreground placeholder:text-text-400 outline-none"
        />
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {corpora.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCorpusId(c.id === corpusId ? null : c.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition-colors ${
                c.id === corpusId
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-bg-300 dark:border-border text-text-300 hover:bg-bg-200"
              }`}
            >
              <Library className="w-3.5 h-3.5" />
              {c.name}
            </button>
          ))}
          <div className="flex-1" />
          {runsInfo && (
            <span className="text-[11px] text-text-400">
              {Math.max(runsInfo.limit - runsInfo.used, 0)} of {runsInfo.limit} runs left this month
            </span>
          )}
          <button
            type="button"
            onClick={run}
            disabled={!query.trim() || running || outOfRuns}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-[13px] font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {running ? "Researching…" : "Run Deep Research"}
          </button>
        </div>
        {outOfRuns && !running && (
          <p className="text-[12px] text-amber-600 mt-2">
            {runsInfo?.limit === 0 ? (
              <>
                Deep Research is available on paid plans.{" "}
                <Link href="/pricing" className="underline hover:text-amber-700">
                  Upgrade to use it.
                </Link>
              </>
            ) : (
              <>
                You&apos;ve used all your Deep Research runs for this month.{" "}
                <Link href="/pricing" className="underline hover:text-amber-700">
                  Upgrade for more.
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      {limit && <AiLimitNotice limit={limit} />}
      {errorMessage && !limit && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[13px] text-text-200">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          Deep Research failed. Please try again.
        </div>
      )}

      {(running || reachedStages.length > 0) && (
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-border shadow-sm p-4 flex flex-col gap-1.5">
          {STAGES.filter((s) => reachedStages.includes(s.id) || (s.id === "rewriting" ? false : running)).map((s) => {
            const reached = reachedStages.includes(s.id)
            const active = stage === s.id && running
            return (
              <div key={s.id} className="flex items-center gap-2 text-[13px]">
                {active ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-accent shrink-0" />
                ) : reached ? (
                  <Check className="w-3.5 h-3.5 text-accent shrink-0" />
                ) : (
                  <Search className="w-3.5 h-3.5 text-text-400 shrink-0 opacity-40" />
                )}
                <span className={reached || active ? "text-text-100" : "text-text-400"}>{s.label}</span>
              </div>
            )
          })}
        </div>
      )}

      {answer && (
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-border shadow-sm p-5">
          {verified !== null && (
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium mb-3 ${
                verified
                  ? "bg-brand-500/10 text-brand-600 border border-brand-500/20"
                  : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
              }`}
            >
              <BadgeCheck className="w-3.5 h-3.5" />
              {verified ? "Citations verified" : "Verification incomplete check citations before relying on them"}
            </div>
          )}
          <div className="text-sm text-text-100 dark:text-foreground leading-relaxed max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={answerMarkdownComponents}>
              {answer}
            </ReactMarkdown>
          </div>
          {sources.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-border">
              <p className="text-[11px] uppercase tracking-wider text-text-400 mb-2">Sources</p>
              <div className="flex flex-col gap-1">
                {sources.map((s) => (
                  <div key={s.n} className="flex items-center gap-2 text-[13px] text-text-200">
                    <FileText className="w-3.5 h-3.5 text-text-400 shrink-0" />
                    <span className="text-text-400">[{s.n}]</span>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                        {s.title}
                      </a>
                    ) : (
                      <span>{s.title}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
