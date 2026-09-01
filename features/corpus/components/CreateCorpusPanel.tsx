"use client"

import { useEffect, useState } from "react"
import { Check, Library, Loader2, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"

type MatchedCase = { id: string; caseNo?: string; title?: string; court?: string; stage?: string; linked: boolean }
type MatchedClient = { id: string; name?: string; company?: string; linked: boolean }

export default function CreateCorpusPanel({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (corpusId: string) => void
}) {
  const [description, setDescription] = useState("")
  const [building, setBuilding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [reviewing, setReviewing] = useState(false)
  const [name, setName] = useState("")
  const [instructions, setInstructions] = useState("")
  const [cases, setCases] = useState<MatchedCase[]>([])
  const [clients, setClients] = useState<MatchedClient[]>([])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const build = async () => {
    if (!description.trim() || building) return
    setBuilding(true)
    setError("")

    const res = await fetch("/api/corpus/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: description.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    setBuilding(false)

    if (!res.ok) {
      setError(data.error || "Could not build this corpus. Try again.")
      return
    }

    setName(data.name)
    setInstructions(data.instructions || "")
    setCases(data.matched.cases ?? [])
    setClients(data.matched.clients ?? [])
    setReviewing(true)
  }

  const confirm = async () => {
    if (saving) return
    setSaving(true)
    setError("")

    const res = await fetch("/api/corpus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || "Untitled corpus",
        description: description.trim(),
        instructions,
        caseIds: cases.filter((c) => c.linked).map((c) => c.id),
        clientIds: clients.filter((c) => c.linked).map((c) => c.id),
      }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)

    if (!res.ok) {
      setError(data.error || "Could not save this corpus. Try again.")
      return
    }
    onCreated(data.corpus.id)
  }

  const linkedCases = cases.filter((c) => c.linked).length
  const linkedClients = clients.filter((c) => c.linked).length

  return (
    <div className="fixed inset-0 z-[300]">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-x-4 top-8 bottom-8 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[620px] max-w-[calc(100vw-2rem)] bg-white dark:bg-card border border-gray-200 dark:border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <Library className="w-4 h-4 text-accent" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-foreground">New corpus</h2>
              <p className="text-xs text-gray-500 dark:text-muted-foreground">
                {reviewing ? "Check what we found before saving" : "Describe the matter in your own words"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-secondary/60 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 py-4">
          {!reviewing ? (
            <div className="flex flex-col gap-3">
              <label className="text-xs font-medium text-gray-500 dark:text-muted-foreground">
                What are you working on?
              </label>
              <textarea
                autoFocus
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={7}
                placeholder="e.g. Property dispute for Sharma against the Delhi Development Authority, second appeal pending before the High Court. I need the pleadings, the 2019 order and anything on limitation."
                className="w-full rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card p-3 text-sm text-gray-900 dark:text-foreground placeholder:text-gray-400 outline-none resize-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <p className="text-xs text-gray-500 dark:text-muted-foreground leading-relaxed">
                We will look through your own cases and clients and pull in the ones that belong to this matter.
                You get to check them before anything is saved.
              </p>
              {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-500 dark:text-muted-foreground">Corpus name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card px-3 text-sm text-gray-900 dark:text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-500 dark:text-muted-foreground">
                  Standing instructions
                </label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={4}
                  placeholder="How should the assistant approach this matter?"
                  className="w-full rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card p-3 text-sm text-gray-900 dark:text-foreground placeholder:text-gray-400 outline-none resize-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>

              {cases.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-muted-foreground">
                    Cases &middot; {linkedCases} of {cases.length} selected
                  </p>
                  <div className="rounded-xl border border-gray-200 dark:border-border overflow-hidden">
                    {cases.map((c, i) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setCases((prev) => prev.map((x) => (x.id === c.id ? { ...x, linked: !x.linked } : x)))
                        }
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-secondary/50 transition-colors",
                          i !== cases.length - 1 && "border-b border-gray-100 dark:border-border"
                        )}
                      >
                        <span
                          className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                            c.linked ? "bg-accent border-accent text-white" : "border-gray-300 dark:border-border"
                          )}
                        >
                          {c.linked && <Check className="w-3 h-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-gray-900 dark:text-foreground truncate">
                            {c.title || c.caseNo || "Untitled case"}
                          </span>
                          <span className="block text-xs text-gray-500 dark:text-muted-foreground truncate">
                            {[c.caseNo, c.court, c.stage].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {clients.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-muted-foreground">
                    Clients &middot; {linkedClients} of {clients.length} selected
                  </p>
                  <div className="rounded-xl border border-gray-200 dark:border-border overflow-hidden">
                    {clients.map((c, i) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setClients((prev) => prev.map((x) => (x.id === c.id ? { ...x, linked: !x.linked } : x)))
                        }
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-secondary/50 transition-colors",
                          i !== clients.length - 1 && "border-b border-gray-100 dark:border-border"
                        )}
                      >
                        <span
                          className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                            c.linked ? "bg-accent border-accent text-white" : "border-gray-300 dark:border-border"
                          )}
                        >
                          {c.linked && <Check className="w-3 h-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-gray-900 dark:text-foreground truncate">
                            {c.name || "Unnamed client"}
                          </span>
                          {c.company && (
                            <span className="block text-xs text-gray-500 dark:text-muted-foreground truncate">
                              {c.company}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {cases.length === 0 && clients.length === 0 && (
                <p className="text-xs text-gray-500 dark:text-muted-foreground leading-relaxed">
                  Nothing in your case files matched this description. The corpus still works   ; add documents
                  to it, or link cases from the corpus page.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100 dark:border-border shrink-0">
          {reviewing && error && (
            <p className="text-xs text-rose-600 dark:text-rose-400 mr-auto">{error}</p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-md text-sm font-medium text-gray-600 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary/60 transition-colors"
          >
            Cancel
          </button>
          {!reviewing ? (
            <button
              type="button"
              onClick={build}
              disabled={!description.trim() || building}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {building ? "Gathering your files..." : "Build corpus"}
            </button>
          ) : (
            <button
              type="button"
              onClick={confirm}
              disabled={saving}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Create corpus
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
