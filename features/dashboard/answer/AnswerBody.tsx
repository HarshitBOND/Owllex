"use client"

import { useMemo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeCitations from "@/lib/markdown/rehype-citations"
import type { ChatSource } from "@/lib/ai/sources"
import { CitationChip } from "./CitationChip"

/**
 * The answer prose. The markdown component map is hand-rolled because
 * @tailwindcss/typography is not installed -- `prose` classes are inert in this
 * app, so every element is styled here against the chat colour tokens.
 */
export function AnswerBody({
  text,
  sources,
  onSelectSource,
}: {
  text: string
  sources: ChatSource[]
  onSelectSource?: (n: number) => void
}) {
  const byNumber = useMemo(() => new Map(sources.map((s) => [s.n, s])), [sources])

  const components = useMemo(
    () => ({
      ...markdownComponents,
      cite: ({ node, children }: any) => {
        const n = Number(node?.properties?.dataCitation ?? children)
        if (!Number.isFinite(n)) return <>{children}</>
        return <CitationChip n={n} source={byNumber.get(n)} onSelect={onSelectSource} />
      },
    }),
    [byNumber, onSelectSource]
  )

  const plugins = useMemo(() => [[rehypeCitations, { maxN: sources.length }] as const], [sources.length])

  return (
    <div className="text-sm text-text-100 leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={plugins as any} components={components as any}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

const markdownComponents = {
  h1: (p: any) => <h1 className="text-lg font-semibold text-text-100 mt-4 mb-2 first:mt-0" {...p} />,
  h2: (p: any) => <h2 className="text-base font-semibold text-text-100 mt-4 mb-2 first:mt-0" {...p} />,
  h3: (p: any) => <h3 className="text-sm font-semibold text-text-100 mt-3 mb-1.5 first:mt-0" {...p} />,
  p: (p: any) => <p className="mb-2.5 last:mb-0 leading-relaxed" {...p} />,
  ul: (p: any) => <ul className="list-disc pl-5 mb-2.5 space-y-1" {...p} />,
  ol: (p: any) => <ol className="list-decimal pl-5 mb-2.5 space-y-1" {...p} />,
  li: (p: any) => <li className="leading-relaxed" {...p} />,
  strong: (p: any) => <strong className="font-semibold text-text-100" {...p} />,
  a: (p: any) => <a className="text-accent underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />,
  blockquote: (p: any) => <blockquote className="border-l-2 border-bg-300 pl-3 italic text-text-300 my-2.5" {...p} />,
  code: ({ inline, ...p }: any) =>
    inline ? (
      <code className="px-1 py-0.5 rounded bg-bg-300/60 text-[0.85em] font-mono" {...p} />
    ) : (
      <code className="block p-3 rounded-lg bg-bg-300/50 text-[0.85em] font-mono overflow-x-auto" {...p} />
    ),
  table: (p: any) => (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-left border-collapse text-[13px]" {...p} />
    </div>
  ),
  th: (p: any) => <th className="border border-bg-300 px-2.5 py-1.5 font-semibold bg-bg-200" {...p} />,
  td: (p: any) => <td className="border border-bg-300 px-2.5 py-1.5 align-top" {...p} />,
}
