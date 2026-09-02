"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileText,
  Fingerprint,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDate, formatSize, verifyStatusStyles } from "../vault-data"

type VaultDoc = {
  id: string
  filename: string
  mimeType: string
  size: number
  sha256: string
  verifyStatus: "unverified" | "present" | "verified" | "missing" | "corrupted"
  lastVerifiedAt: number
  createdAt: number
}

const ALLOWED_ACCEPT = ".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.gif,.webp"

export default function VaultHome() {
  const [documents, setDocuments] = useState<VaultDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string[]>([])
  const [uploadError, setUploadError] = useState("")
  const [dragging, setDragging] = useState(false)
  const [verifying, setVerifying] = useState<Record<string, boolean>>({})
  const [verifyMessage, setVerifyMessage] = useState<Record<string, string>>({})
  const [verifyingAll, setVerifyingAll] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/vault/documents")
    if (!res.ok) {
      setLoading(false)
      return
    }
    const data = await res.json()
    setDocuments(data.documents ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const upload = async (files: File[]) => {
    setUploadError("")
    for (const file of files) {
      setUploading((prev) => [...prev, file.name])
      const form = new FormData()
      form.append("file", file)

      const res = await fetch("/api/vault/documents", { method: "POST", body: form })
      const data = await res.json().catch(() => ({}))
      setUploading((prev) => prev.filter((n) => n !== file.name))

      if (!res.ok) {
        setUploadError(data.error || `Could not upload ${file.name}`)
        continue
      }
      await load()
    }
  }

  const openDocument = async (docId: string) => {
    const res = await fetch(`/api/vault/documents/${docId}`)
    if (!res.ok) return
    const data = await res.json()
    window.open(data.url, "_blank", "noreferrer")
  }

  const removeDocument = async (docId: string) => {
    await fetch(`/api/vault/documents/${docId}`, { method: "DELETE" })
    await load()
  }

  const verifyDocument = async (docId: string, deep = true) => {
    setVerifying((prev) => ({ ...prev, [docId]: true }))
    setVerifyMessage((prev) => ({ ...prev, [docId]: "" }))
    try {
      const res = await fetch(
        `/api/vault/documents/${docId}/verify${deep ? "?deep=1" : ""}`,
        { method: "POST" }
      )
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setVerifyMessage((prev) => ({ ...prev, [docId]: data.message || "" }))
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === docId
              ? { ...d, verifyStatus: data.verifyStatus, lastVerifiedAt: data.lastVerifiedAt }
              : d
          )
        )
      } else {
        setVerifyMessage((prev) => ({ ...prev, [docId]: data.error || "Verification failed" }))
      }
    } finally {
      setVerifying((prev) => ({ ...prev, [docId]: false }))
    }
  }

  const verifyAll = async () => {
    setVerifyingAll(true)
    for (const doc of documents) {
      await verifyDocument(doc.id, false)
    }
    setVerifyingAll(false)
  }

  const copyHash = (docId: string, hash: string) => {
    navigator.clipboard
      ?.writeText(hash)
      .then(() => {
        setCopiedId(docId)
        setTimeout(() => setCopiedId(null), 1500)
      })
      .catch(() => {})
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Security banner */}
      <div className="rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-900 to-gray-800 dark:from-gray-950 dark:to-gray-900 p-6 text-white">
        <div className="flex items-start gap-4">
          <span className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0 backdrop-blur">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
          </span>
          <div className="min-w-0">
            <h1 className="font-serif text-xl sm:text-2xl font-semibold">Your Vault</h1>
            <p className="text-sm text-white/70 mt-1 max-w-xl">
              A private, encrypted store for every document you upload. Only you can access it — each
              file is sealed with a unique SHA-256 fingerprint so you can prove at any time that it
              hasn&apos;t been altered or lost.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-5">
          {[
            { icon: Lock, label: "Encrypted at rest" },
            { icon: KeyRound, label: "Private, signed access only" },
            { icon: Fingerprint, label: "SHA-256 integrity hashing" },
          ].map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90"
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Upload */}
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
          Drop documents to store them in your vault
        </p>
        <p className="text-xs text-gray-500 dark:text-muted-foreground max-w-sm">
          PDF, DOCX, TXT, MD, JPG, PNG, GIF or WEBP, up to 25MB each. Every file is hashed the moment it
          lands.
        </p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mt-3 inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Choose files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_ACCEPT}
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

      {/* Document list */}
      {loading ? (
        <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card py-20 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
        </div>
      ) : uploading.length === 0 && documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-border bg-white dark:bg-card py-16 flex flex-col items-center justify-center text-center gap-1">
          <Lock className="w-6 h-6 text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-sm font-semibold text-gray-900 dark:text-foreground">Your vault is empty</p>
          <p className="text-xs text-gray-500 dark:text-muted-foreground">
            Uploaded documents will appear here, sealed and hashed.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-100 dark:border-border">
            <span className="text-xs font-medium text-gray-400">
              {documents.length} document{documents.length === 1 ? "" : "s"} in your vault
            </span>
            {documents.length > 0 && (
              <button
                type="button"
                onClick={verifyAll}
                disabled={verifyingAll}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {verifyingAll ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Run hashing test on all
              </button>
            )}
          </div>

          <div className="hidden sm:grid grid-cols-[1fr_90px_150px_190px_150px_88px] gap-4 px-5 py-2.5 border-b border-gray-100 dark:border-border text-xs font-medium text-gray-400">
            <span>Document</span>
            <span>Size</span>
            <span>Integrity</span>
            <span>SHA-256</span>
            <span>Uploaded</span>
            <span />
          </div>

          {uploading.map((filename) => (
            <div
              key={filename}
              className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_90px_150px_190px_150px_88px] gap-2 sm:gap-4 items-center px-5 py-3 border-b border-gray-100 dark:border-border"
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-secondary/60 flex items-center justify-center shrink-0">
                  <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-foreground truncate">
                  {filename}
                </span>
              </span>
              <span className="hidden sm:block text-xs text-gray-400">—</span>
              <span className="hidden sm:block text-xs text-gray-500 dark:text-muted-foreground">
                Encrypting &amp; hashing…
              </span>
              <span className="hidden sm:block" />
              <span className="hidden sm:block" />
              <span className="hidden sm:block" />
            </div>
          ))}

          {documents.map((d, i) => {
            const status = verifyStatusStyles[d.verifyStatus] ?? verifyStatusStyles.unverified
            const isVerifying = !!verifying[d.id]
            const message = verifyMessage[d.id]
            return (
              <div
                key={d.id}
                className={cn(
                  "flex flex-col",
                  i !== documents.length - 1 && "border-b border-gray-100 dark:border-border"
                )}
              >
                <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_90px_150px_190px_150px_88px] gap-2 sm:gap-4 items-center px-5 py-3 hover:bg-gray-50 dark:hover:bg-secondary/50 transition-colors">
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
                        {d.lastVerifiedAt ? `Last checked ${formatDate(d.lastVerifiedAt)}` : "Not yet checked"}
                      </span>
                    </span>
                  </button>
                  <span className="hidden sm:block text-xs text-gray-500 dark:text-muted-foreground">
                    {formatSize(d.size)}
                  </span>
                  <span className="hidden sm:block">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full text-[11px] font-medium px-2 py-0.5",
                        status.bgColor,
                        status.color
                      )}
                    >
                      {status.label}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => copyHash(d.id, d.sha256)}
                    className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-gray-500 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground transition-colors"
                    title={d.sha256}
                  >
                    <span className="truncate">{d.sha256.slice(0, 12)}…</span>
                    {copiedId === d.id ? (
                      <Check className="w-3 h-3 text-brand-600 shrink-0" />
                    ) : (
                      <Copy className="w-3 h-3 shrink-0" />
                    )}
                  </button>
                  <span className="hidden sm:block text-xs text-gray-500 dark:text-muted-foreground">
                    {formatDate(d.createdAt)}
                  </span>
                  <span className="flex items-center gap-1 justify-self-end">
                    <button
                      type="button"
                      onClick={() => verifyDocument(d.id)}
                      disabled={isVerifying}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                      aria-label={`Run hashing test on ${d.filename}`}
                      title="Run hashing integrity test"
                    >
                      {isVerifying ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => openDocument(d.id)}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-accent hover:bg-accent/10 transition-colors"
                      aria-label={`Download ${d.filename}`}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
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
                {message && (
                  <div className="px-5 pb-3 -mt-1 sm:pl-16">
                    <p
                      className={cn(
                        "text-xs",
                        d.verifyStatus === "verified"
                          ? "text-brand-600 dark:text-brand-400"
                          : d.verifyStatus === "present"
                          ? "text-sky-600 dark:text-sky-400"
                          : d.verifyStatus === "unverified"
                          ? "text-gray-500"
                          : "text-rose-600 dark:text-rose-400"
                      )}
                    >
                      {message}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
