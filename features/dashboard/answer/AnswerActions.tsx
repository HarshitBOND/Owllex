"use client"

import { Check, Copy, Download, Loader2, Pencil, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type Feedback = "up" | "down" | null

const button =
  "p-1.5 rounded-md text-text-400 hover:text-text-100 hover:bg-bg-200 transition-colors disabled:opacity-50"

export function AnswerActions({
  feedback,
  onFeedback,
  copied,
  onCopy,
  exporting,
  onExport,
  onRegenerate,
  onEdit,
}: {
  feedback: Feedback
  onFeedback: (value: Feedback) => void
  copied: boolean
  onCopy: () => void
  exporting: boolean
  onExport: (format: "pdf" | "docx") => void
  onRegenerate?: () => void
  onEdit?: () => void
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => onFeedback(feedback === "up" ? null : "up")}
        className={`${button} ${feedback === "up" ? "text-accent hover:text-accent" : ""}`}
        aria-label="Good response"
        aria-pressed={feedback === "up"}
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => onFeedback(feedback === "down" ? null : "down")}
        className={`${button} ${feedback === "down" ? "text-destructive hover:text-destructive" : ""}`}
        aria-label="Bad response"
        aria-pressed={feedback === "down"}
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>

      <button onClick={onCopy} className={button} aria-label="Copy response">
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={button} disabled={exporting} aria-label="Download response">
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onExport("pdf")}>Download as PDF</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExport("docx")}>Download as Word</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

      {onRegenerate && (
        <button onClick={onRegenerate} className={button} aria-label="Regenerate response">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      )}
      {onEdit && (
        <button onClick={onEdit} className={button} aria-label="Edit question and ask again">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
