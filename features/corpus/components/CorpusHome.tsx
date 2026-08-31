"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Briefcase,
  FileText,
  Library,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  UsersRound,
  Workflow,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAiChat } from "@/contexts/AiChatContext"
import { accentFor, formatDate } from "../corpus-data"
import CreateCorpusPanel from "./CreateCorpusPanel"

const FILTERS = [
  { key: "all", label: "All corpus" },
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
] as const

export default function CorpusHome() {
  const router = useRouter()
  const { corpora, refreshCorpora, setActiveCorpusId } = useAiChat()
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all")
  const [creating, setCreating] = useState(false)

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return corpora.filter((c) => {
      if (filter === "active" && c.archived) return false
      if (filter === "archived" && !c.archived) return false
      if (!q) return true
      return c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    })
  }, [corpora, search, filter])

  const openChat = (id: string) => {
    setActiveCorpusId(id)
    router.push("/dashboard")
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <aside className="lg:w-64 shrink-0 flex flex-col gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden lg:overflow-visible">
          <div className="flex lg:flex-col overflow-x-auto lg:overflow-visible p-1.5 lg:p-2 gap-1">
            {FILTERS.map((f) => {
              const count =
                f.key === "all"
                  ? corpora.length
                  : corpora.filter((c) => (f.key === "archived" ? c.archived : !c.archived)).length
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "shrink-0 flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-left transition-colors whitespace-nowrap",
                    filter === f.key
                      ? "bg-accent/10 text-accent font-semibold"
                      : "text-gray-600 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-secondary/60"
                  )}
                >
                  <span>{f.label}</span>
                  <span className="text-xs text-gray-400">{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="hidden lg:flex flex-col gap-2 rounded-xl border border-gray-200 dark:border-border bg-accent/5 p-4">
          <Sparkles className="w-4 h-4 text-accent" />
          <p className="text-sm font-semibold text-gray-900 dark:text-foreground">One box, one matter</p>
          <p className="text-xs text-gray-500 dark:text-muted-foreground leading-relaxed">
            Describe what you are working on. We pull in the matching cases, clients and documents so every chat
            in that corpus already knows the file.
          </p>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your corpus..."
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card pl-9 pr-3 text-sm text-gray-900 dark:text-foreground placeholder:text-gray-400 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            New corpus
          </button>
        </div>

        {visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 dark:border-border bg-white dark:bg-card py-16 flex flex-col items-center justify-center text-center gap-1">
            <span className="w-11 h-11 rounded-full bg-accent/10 flex items-center justify-center mb-2">
              <Library className="w-5 h-5 text-accent" />
            </span>
            <p className="text-sm font-semibold text-gray-900 dark:text-foreground">
              {corpora.length === 0 ? "No corpus yet" : "Nothing matches that search"}
            </p>
            <p className="text-xs text-gray-500 dark:text-muted-foreground max-w-sm">
              {corpora.length === 0
                ? "Create one for a matter you are running. Describe it once and the assistant carries that context into every chat, draft and workflow."
                : "Try a different name, or clear the search."}
            </p>
            {corpora.length === 0 && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-3 inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New corpus
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {visible.map((c) => {
              const accent = accentFor(c.accent)
              return (
                <div
                  key={c.id}
                  className="group rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card hover:border-accent/40 hover:shadow-sm transition-all p-4 flex flex-col min-h-[196px]"
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/corpus/${c.id}`)}
                    className="text-left flex-1 flex flex-col"
                  >
                    <span className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-3", accent.bgColor)}>
                      <Library className={cn("w-4 h-4", accent.color)} />
                    </span>
                    <span className="block text-sm font-semibold text-gray-900 dark:text-foreground truncate">
                      {c.name}
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-muted-foreground mt-1 line-clamp-2 flex-1">
                      {c.description || "No description"}
                    </span>

                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11px] text-gray-500 dark:text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Briefcase className="w-3 h-3" />
                        {c.caseCount}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <UsersRound className="w-3 h-3" />
                        {c.clientCount}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {c.documentCount}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {c.chatCount}
                      </span>
                      <span className="ml-auto">{formatDate(c.updatedAt)}</span>
                    </span>
                  </button>

                  <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-border">
                    <button
                      type="button"
                      onClick={() => openChat(c.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Chat
                    </button>
                    <span className="text-gray-300 dark:text-border">|</span>
                    <button
                      type="button"
                      onClick={() => router.push(`/corpus/${c.id}/workflow`)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-muted-foreground hover:text-accent transition-colors"
                    >
                      <Workflow className="w-3.5 h-3.5" />
                      Workflow
                    </button>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-accent ml-auto transition-colors" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {creating && (
        <CreateCorpusPanel
          onClose={() => setCreating(false)}
          onCreated={async (id) => {
            setCreating(false)
            await refreshCorpora()
            router.push(`/corpus/${id}`)
          }}
        />
      )}
    </div>
  )
}
