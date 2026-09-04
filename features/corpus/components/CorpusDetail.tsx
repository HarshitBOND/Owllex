"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Briefcase,
  Check,
  FilePlus2,
  FileText,
  Library,
  Loader2,
  MessageSquare,
  Plus,
  Trash2,
  Upload,
  UsersRound,
  Vault,
  Workflow,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAiChat } from "@/contexts/AiChatContext"
import { useSaveToVault } from "@/features/vault/useSaveToVault"
import { accentFor, formatDate, formatSize, statusStyles } from "../corpus-data"
import type { CorpusDetail as Detail } from "../types"

const TABS = ["Overview", "Knowledge", "Chats", "Workflow"] as const

function SaveDocumentToVaultButton({ corpusId, docId, filename }: { corpusId: string; docId: string; filename: string }) {
  const saveToVault = useSaveToVault(`/api/corpus/${corpusId}/documents/${docId}/save-to-vault`)
  return (
    <button
      type="button"
      onClick={() => saveToVault.save()}
      disabled={saveToVault.state === "saving"}
      className="w-7 h-7 rounded-md flex items-center justify-center text-gray-300 hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
      aria-label={`Save ${filename} to Vault`}
      title="Save to Vault"
    >
      {saveToVault.state === "saving" ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Vault className="w-3.5 h-3.5" />
      )}
    </button>
  )
}

export default function CorpusDetail({ corpusId }: { corpusId: string }) {
  const router = useRouter()
  const { refreshCorpora, setActiveCorpusId, selectConversation } = useAiChat()
  const [corpus, setCorpus] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview")
  const [chats, setChats] = useState<{ id: string; title: string; updatedAt: number }[]>([])
  const [instructions, setInstructions] = useState("")
  const [savedAt, setSavedAt] = useState(0)
  const [uploading, setUploading] = useState<string[]>([])
  const [uploadError, setUploadError] = useState("")
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/corpus/${corpusId}`)
    if (!res.ok) {
      setLoading(false)
      return
    }
    const data = await res.json()
    setCorpus(data.corpus)
    setInstructions(data.corpus.instructions || "")
    setLoading(false)
  }, [corpusId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (tab !== "Chats") return
    fetch(`/api/corpus/${corpusId}/conversations`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setChats(d.conversations ?? []))
      .catch(() => {})
  }, [tab, corpusId])

  const saveInstructions = async () => {
    await fetch(`/api/corpus/${corpusId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructions }),
    })
    setSavedAt(Date.now())
  }

  const upload = async (files: File[]) => {
    setUploadError("")
    for (const file of files) {
      setUploading((prev) => [...prev, file.name])
      const form = new FormData()
      form.append("file", file)

      const res = await fetch(`/api/corpus/${corpusId}/documents`, { method: "POST", body: form })
      const data = await res.json().catch(() => ({}))
      setUploading((prev) => prev.filter((n) => n !== file.name))

      if (!res.ok) {
        setUploadError(data.error || `Could not upload ${file.name}`)
        continue
      }
      if (data.warning) setUploadError(data.warning)
      await load()
      await refreshCorpora()
    }
  }

  const removeDocument = async (docId: string) => {
    await fetch(`/api/corpus/${corpusId}/documents/${docId}`, { method: "DELETE" })
    await load()
    await refreshCorpora()
  }

  const openDocument = async (docId: string) => {
    const res = await fetch(`/api/corpus/${corpusId}/documents/${docId}`)
    if (!res.ok) return
    const data = await res.json()
    window.open(data.url, "_blank", "noreferrer")
  }

  const startChat = (chatId?: string) => {
    setActiveCorpusId(corpusId)
    if (chatId) selectConversation(chatId)
    router.push("/dashboard")
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card py-20 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-accent animate-spin" />
      </div>
    )
  }

  if (!corpus) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-border bg-white dark:bg-card py-16 flex flex-col items-center justify-center text-center gap-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-foreground">Corpus not found</p>
        <button
          type="button"
          onClick={() => router.push("/corpus")}
          className="mt-3 text-xs font-medium text-accent hover:underline"
        >
          Back to all corpus
        </button>
      </div>
    )
  }

  const accent = accentFor(corpus.accent)

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-5">
        <div className="flex items-start gap-3">
          <span className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", accent.bgColor)}>
            <Library className={cn("w-5 h-5", accent.color)} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-xl sm:text-2xl font-semibold text-gray-900 dark:text-foreground truncate">
              {corpus.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{corpus.description}</p>
          </div>
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            {/* Opens the form library with this corpus already linked, so the
                first thing the wizard does is fill in what the matter knows. */}
            <button
              type="button"
              onClick={() => router.push(`/draft-documents/templates?corpusId=${encodeURIComponent(corpusId)}`)}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md border border-gray-200 dark:border-border text-sm font-medium text-gray-800 dark:text-foreground hover:bg-gray-50 dark:hover:bg-secondary transition-colors"
            >
              <FilePlus2 className="w-4 h-4" />
              Draft
            </button>
            <button
              type="button"
              onClick={() => startChat()}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              Chat in this corpus
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-gray-500 dark:text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5" />
            {corpus.cases.length} case{corpus.cases.length === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <UsersRound className="w-3.5 h-3.5" />
            {corpus.clients.length} client{corpus.clients.length === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            {corpus.documents.length} document{corpus.documents.length === 1 ? "" : "s"}
          </span>
          <span className="ml-auto">Updated {formatDate(corpus.updatedAt)}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => (t === "Workflow" ? router.push(`/corpus/${corpusId}/workflow`) : setTab(t))}
            className={cn(
              "shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t
                ? "border-accent text-accent"
                : "border-transparent text-gray-500 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="flex flex-col gap-5">
          <section className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-foreground mb-1">Standing instructions</h2>
            <p className="text-xs text-gray-500 dark:text-muted-foreground mb-3">
              Sent with every message in this corpus. Say how you want this matter handled.
            </p>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
              placeholder="e.g. Always check limitation first. The client wants a settlement, not a trial."
              className="w-full rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card p-3 text-sm text-gray-900 dark:text-foreground placeholder:text-gray-400 outline-none resize-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <div className="flex items-center gap-3 mt-3">
              <button
                type="button"
                onClick={saveInstructions}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Save
              </button>
              {savedAt > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400">
                  <Check className="w-3.5 h-3.5" />
                  Saved
                </span>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-foreground mb-3">Cases in this corpus</h2>
            {corpus.cases.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-border bg-white dark:bg-card py-10 flex flex-col items-center justify-center text-center gap-1">
                <p className="text-xs text-gray-500 dark:text-muted-foreground">No cases linked yet</p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden">
                {corpus.cases.map((c: any, i: number) => (
                  <button
                    key={String(c._id)}
                    type="button"
                    onClick={() => router.push(`/case-tracking/view/${String(c._id)}`)}
                    className={cn(
                      "w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-secondary/50 transition-colors",
                      i !== corpus.cases.length - 1 && "border-b border-gray-100 dark:border-border"
                    )}
                  >
                    <span className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
                      <Briefcase className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900 dark:text-foreground truncate">
                        {c.caseTitle || c.caseNo || "Untitled case"}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-muted-foreground truncate">
                        {[c.caseNo, c.courtName, c.caseStage].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {c.courtDate && (
                      <span className="hidden sm:block text-xs text-gray-500 dark:text-muted-foreground shrink-0">
                        {c.courtDate}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-foreground mb-3">Clients in this corpus</h2>
            {corpus.clients.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-border bg-white dark:bg-card py-10 flex flex-col items-center justify-center text-center gap-1">
                <p className="text-xs text-gray-500 dark:text-muted-foreground">No clients linked yet</p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden">
                {corpus.clients.map((c: any, i: number) => (
                  <button
                    key={String(c._id)}
                    type="button"
                    onClick={() => router.push(`/my-clients/view/${String(c._id)}`)}
                    className={cn(
                      "w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-secondary/50 transition-colors",
                      i !== corpus.clients.length - 1 && "border-b border-gray-100 dark:border-border"
                    )}
                  >
                    <span className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center shrink-0">
                      <UsersRound className="w-4 h-4 text-brand-700 dark:text-brand-400" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900 dark:text-foreground truncate">
                        {c.name || "Unnamed client"}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-muted-foreground truncate">
                        {[c.company, c.contact, c.email].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "Knowledge" && (
        <div className="flex flex-col gap-4">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              upload(Array.from(e.dataTransfer.files))
            }}
            className={cn(
              "rounded-xl border-2 border-dashed bg-white dark:bg-card py-10 flex flex-col items-center justify-center text-center gap-1 transition-colors",
              dragging ? "border-accent bg-accent/5" : "border-gray-200 dark:border-border"
            )}
          >
            <span className="w-11 h-11 rounded-full bg-accent/10 flex items-center justify-center mb-2">
              <Upload className="w-5 h-5 text-accent" />
            </span>
            <p className="text-sm font-semibold text-gray-900 dark:text-foreground">
              Drop documents to add them to this corpus
            </p>
            <p className="text-xs text-gray-500 dark:text-muted-foreground max-w-sm">
              PDF, DOCX, TXT, MD, JPG or PNG, up to 25MB each. Once indexed, the assistant can quote them in any
              chat in this corpus.
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Choose files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                upload(Array.from(e.target.files ?? []))
                e.target.value = ""
              }}
            />
          </div>

          {uploadError && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">{uploadError}</p>
            </div>
          )}

          {(uploading.length > 0 || corpus.documents.length > 0) && (
            <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden">
              <div className="hidden sm:grid grid-cols-[1fr_120px_120px_140px_64px] gap-4 px-5 py-2.5 border-b border-gray-100 dark:border-border text-xs font-medium text-gray-400">
                <span>Document</span>
                <span>Size</span>
                <span>Status</span>
                <span>Added</span>
                <span />
              </div>

              {uploading.map((filename) => (
                <div
                  key={filename}
                  className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_120px_140px_64px] gap-2 sm:gap-4 items-center px-5 py-3 border-b border-gray-100 dark:border-border"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-secondary/60 flex items-center justify-center shrink-0">
                      <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-foreground truncate">{filename}</span>
                  </span>
                  <span className="hidden sm:block text-xs text-gray-400">  ;</span>
                  <span className="hidden sm:block text-xs text-gray-500 dark:text-muted-foreground">Uploading</span>
                  <span className="hidden sm:block" />
                  <span className="hidden sm:block" />
                </div>
              ))}

              {corpus.documents.map((d, i) => {
                const status = statusStyles[d.status] ?? statusStyles.pending
                return (
                  <div
                    key={d.id}
                    className={cn(
                      "grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_120px_140px_64px] gap-2 sm:gap-4 items-center px-5 py-3 hover:bg-gray-50 dark:hover:bg-secondary/50 transition-colors",
                      i !== corpus.documents.length - 1 && "border-b border-gray-100 dark:border-border"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => openDocument(d.id)}
                      className="flex items-center gap-3 min-w-0 text-left"
                    >
                      <span className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900 dark:text-foreground truncate">
                          {d.filename}
                        </span>
                        <span className="block text-xs text-gray-400">
                          {d.status === "ready"
                            ? `${d.chunkCount} passage${d.chunkCount === 1 ? "" : "s"} indexed`
                            : d.error || "Not searchable"}
                        </span>
                      </span>
                    </button>
                    <span className="hidden sm:block text-xs text-gray-500 dark:text-muted-foreground">
                      {formatSize(d.size)}
                    </span>
                    <span className="hidden sm:block">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full text-[11px] font-medium px-2 py-0.5",
                          status.bgColor,
                          status.color
                        )}
                      >
                        {status.label}
                      </span>
                    </span>
                    <span className="hidden sm:block text-xs text-gray-500 dark:text-muted-foreground">
                      {formatDate(d.createdAt)}
                    </span>
                    <span className="flex items-center gap-1 justify-self-end">
                      <SaveDocumentToVaultButton corpusId={corpusId} docId={d.id} filename={d.filename} />
                      <button
                        type="button"
                        onClick={() => removeDocument(d.id)}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-gray-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                        aria-label={`Remove ${d.filename}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === "Chats" && (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => startChat()}
            className="rounded-xl border border-gray-200 dark:border-border bg-accent/5 hover:bg-accent/10 transition-colors py-6 flex flex-col items-center justify-center gap-2"
          >
            <span className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-white">
              <Plus className="w-5 h-5" />
            </span>
            <span className="text-sm font-semibold text-gray-900 dark:text-foreground">New chat in this corpus</span>
            <span className="text-xs text-gray-500 dark:text-muted-foreground">
              It already knows the cases, clients and documents above
            </span>
          </button>

          {chats.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 dark:border-border bg-white dark:bg-card py-12 flex flex-col items-center justify-center text-center gap-1">
              <p className="text-xs text-gray-500 dark:text-muted-foreground">No chats in this corpus yet</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden">
              {chats.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => startChat(c.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-secondary/50 transition-colors",
                    i !== chats.length - 1 && "border-b border-gray-100 dark:border-border"
                  )}
                >
                  <span className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-secondary/60 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4 text-gray-500 dark:text-muted-foreground" />
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-foreground truncate flex-1">
                    {c.title}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">{formatDate(c.updatedAt)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
