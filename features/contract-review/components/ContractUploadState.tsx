"use client"

import { useRef, useState } from "react"
import { FileCheck2, UploadCloud } from "lucide-react"

interface ContractUploadStateProps {
  onUpload: (file: File) => void
}

export default function ContractUploadState({ onUpload }: ContractUploadStateProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
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
        if (file) onUpload(file)
      }}
      className={`flex flex-col items-center justify-center text-center rounded-2xl border-2 border-dashed transition-colors py-20 px-6 ${
        isDragging ? "border-accent bg-accent/5" : "border-gray-200 dark:border-border bg-white dark:bg-card"
      }`}
    >
      <div className="w-14 h-14 mb-4 flex items-center justify-center rounded-2xl bg-accent/10">
        <FileCheck2 className="w-7 h-7 text-accent" />
      </div>
      <h2 className="font-serif text-xl font-semibold text-gray-900 dark:text-foreground mb-1.5">
        Upload a contract to review
      </h2>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        Drop a PDF, DOCX, or TXT file here, or browse your computer. Our AI will flag risky clauses, missing terms,
        and deviations from standard language.
      </p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
      >
        <UploadCloud className="w-4 h-4" />
        Choose a file
      </button>
      <p className="mt-4 text-xs text-gray-400">
        Or select <span className="font-medium text-gray-500 dark:text-muted-foreground">Contract Review</span> from
        the tools menu on the AI chat and attach a file there.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onUpload(file)
          e.target.value = ""
        }}
      />
    </div>
  )
}
