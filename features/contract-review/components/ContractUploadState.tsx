"use client"

import { useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  FileText,
  Lightbulb,
  Lock,
  Scale,
  ShieldAlert,
  UploadCloud,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SAMPLE_CONTRACT_MARKDOWN, type ExtractionMode } from "../data"

const securityPoints = [
  {
    title: "Encryption everywhere",
    description: "Documents are encrypted in transit and at rest, both while uploading and in storage.",
  },
  {
    title: "Never used for training",
    description: "Your contracts are never used to train our AI models or shared with third parties.",
  },
  {
    title: "Access controls",
    description: "Only you can access your uploaded documents and review results.",
  },
  {
    title: "Deletion on request",
    description: "You can request permanent deletion of your documents and review history at any time.",
  },
]

interface ContractUploadStateProps {
  onUpload: (file: File, extractionMode: ExtractionMode) => void
  error?: string | null
}

const extractionModes: Array<{ key: ExtractionMode; label: string; description: string }> = [
  { key: "auto", label: "Auto-detect", description: "Reads normal PDF text directly; OCR only kicks in for scanned pages." },
  { key: "force_ocr", label: "Force OCR", description: "Runs OCR on every page, even ones with a text layer." },
  { key: "text_only", label: "Text only", description: "Never runs OCR -- fastest, but scanned pages come back blank." },
]

const whatYouGet = [
  {
    icon: ShieldAlert,
    iconBg: "bg-red-50 dark:bg-red-500/10",
    iconColor: "text-red-500 dark:text-red-400",
    title: "Risk detection",
    description: "Identify critical issues and potential legal risks.",
  },
  {
    icon: AlertTriangle,
    iconBg: "bg-orange-50 dark:bg-orange-500/10",
    iconColor: "text-orange-500 dark:text-orange-400",
    title: "Clause analysis",
    description: "Analyze important clauses and unfavorable terms.",
  },
  {
    icon: Lightbulb,
    iconBg: "bg-blue-50 dark:bg-blue-500/10",
    iconColor: "text-blue-500 dark:text-blue-400",
    title: "Suggestions",
    description: "Get AI suggestions to improve clarity and fairness.",
  },
  {
    icon: Scale,
    iconBg: "bg-brand-50 dark:bg-brand-500/10",
    iconColor: "text-brand-500 dark:text-brand-400",
    title: "Plain language summary",
    description: "Understand complex legal terms in simple language.",
  },
]

export default function ContractUploadState({ onUpload, error }: ContractUploadStateProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isSecurityDialogOpen, setIsSecurityDialogOpen] = useState(false)
  const [extractionMode, setExtractionMode] = useState<ExtractionMode>("auto")
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSample = () => {
    onUpload(
      new File([SAMPLE_CONTRACT_MARKDOWN], "Sample_Service_Agreement.md", { type: "text/markdown" }),
      extractionMode,
    )
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">
      <div className="flex flex-col gap-4 min-w-0">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            setIsDragging(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            const file = e.dataTransfer.files?.[0]
            if (file) onUpload(file, extractionMode)
          }}
          className={`flex flex-col rounded-2xl border-2 border-dashed transition-colors ${
            isDragging ? "border-accent bg-accent/5" : "border-gray-200 dark:border-border bg-white dark:bg-card"
          }`}
        >
          <div className="flex flex-col items-center text-center pt-14 pb-10 px-6">
            <div className="relative w-16 h-16 mb-4 flex items-center justify-center rounded-2xl bg-gray-100 dark:bg-secondary">
              <FileText className="w-7 h-7 text-gray-400 dark:text-muted-foreground" />
              <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center ring-4 ring-white dark:ring-card">
                <ArrowUp className="w-3.5 h-3.5 text-white" />
              </span>
            </div>
            <h2 className="font-serif text-xl font-semibold text-gray-900 dark:text-foreground mb-1.5">
              Upload a contract to review
            </h2>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              Our AI will analyze your contract and highlight risks, missing clauses, and improvement suggestions.
            </p>
            {error && (
              <p className="mb-4 max-w-sm text-[12.5px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-gray-900 dark:bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <UploadCloud className="w-4 h-4" />
              Upload contract
            </button>

            <div className="flex items-center gap-3 w-full max-w-xs my-5">
              <div className="h-px flex-1 bg-gray-200 dark:bg-border" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">or drag and drop your file here</span>
              <div className="h-px flex-1 bg-gray-200 dark:bg-border" />
            </div>

            <p className="text-xs text-gray-400">
              Supports PDF, DOCX, TXT, scanned images <span className="mx-1">•</span> Max size 25MB
            </p>

            <div
              role="radiogroup"
              aria-label="Text extraction mode"
              onClick={(e) => e.stopPropagation()}
              className="mt-4 inline-flex items-center gap-0.5 rounded-lg border border-gray-200 dark:border-border bg-gray-50 dark:bg-secondary/40 p-0.5"
            >
              {extractionModes.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={extractionMode === m.key}
                  title={m.description}
                  onClick={() => setExtractionMode(m.key)}
                  className={`h-7 px-2.5 rounded-md text-[11.5px] font-medium transition-colors ${
                    extractionMode === m.key
                      ? "bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-gray-700 dark:hover:text-foreground"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onUpload(file, extractionMode)
                e.target.value = ""
              }}
            />
          </div>

          <div className="border-t border-gray-100 dark:border-border px-8 py-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-foreground mb-1">Try a sample</h3>
            <p className="text-[13px] text-muted-foreground mb-3">
              Want to see how it works? Try our sample contract.
            </p>
            <button
              type="button"
              onClick={handleSample}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-gray-200 dark:border-border text-[13px] font-medium text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-secondary transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              Use sample contract
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-border bg-white dark:bg-card p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-foreground">Recent reviews</h3>
            <button
              type="button"
              className="text-xs font-medium text-accent hover:underline inline-flex items-center gap-1"
            >
              View all reviews
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[13px] text-muted-foreground">Your recently reviewed contracts will appear here.</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-gray-200 dark:border-border bg-white dark:bg-card p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-foreground mb-4">What you&apos;ll get</h3>
          <div className="flex flex-col gap-4">
            {whatYouGet.map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${item.iconBg}`}>
                  <item.icon className={`w-4 h-4 ${item.iconColor}`} />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 dark:text-foreground">{item.title}</p>
                  <p className="text-[12.5px] text-muted-foreground leading-snug mt-0.5">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-indigo-100 dark:border-indigo-500/20 bg-indigo-50/60 dark:bg-indigo-500/10 p-5">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-gray-900 dark:text-foreground">Your data is secure</p>
              <p className="text-[12.5px] text-muted-foreground leading-snug mt-0.5">
                Your documents are encrypted and never used to train our models.
              </p>
              <button
                type="button"
                onClick={() => setIsSecurityDialogOpen(true)}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 mt-2"
              >
                Learn more about security
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isSecurityDialogOpen} onOpenChange={setIsSecurityDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Your data is secure
            </DialogTitle>
            <DialogDescription>
              Here&apos;s how we protect the documents you upload for review.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {securityPoints.map((point) => (
              <div key={point.title}>
                <p className="text-[13px] font-semibold text-gray-900 dark:text-foreground">{point.title}</p>
                <p className="text-[12.5px] text-muted-foreground leading-snug mt-0.5">{point.description}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
