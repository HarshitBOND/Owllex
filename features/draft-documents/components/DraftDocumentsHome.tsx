"use client"

import { useRouter } from "next/navigation"
import { Plus, ArrowRight, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { documentTemplates, recentDocuments } from "../data"

export default function DraftDocumentsHome() {
  const router = useRouter()
  const openWorkspace = () => router.push("/draft-documents/new")

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-foreground mb-3">Start a new document</h2>
        <div className="flex flex-col lg:flex-row gap-4">
          <button
            type="button"
            onClick={openWorkspace}
            className="lg:w-64 shrink-0 flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 dark:border-border bg-accent/5 hover:bg-accent/10 transition-colors py-10 px-6"
          >
            <span className="w-11 h-11 rounded-full bg-accent flex items-center justify-center text-white">
              <Plus className="w-5 h-5" />
            </span>
            <span className="text-center">
              <span className="block text-sm font-semibold text-gray-900 dark:text-foreground">Blank document</span>
              <span className="block text-xs text-gray-500 dark:text-muted-foreground mt-0.5">Start from scratch</span>
            </span>
          </button>

          <div className="hidden lg:flex flex-col items-center justify-center px-1">
            <span className="text-xs text-gray-400">or</span>
          </div>

          <div className="flex-1 flex flex-col gap-2 min-w-0">
            <p className="text-xs font-medium text-gray-500 dark:text-muted-foreground">Use a template</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {documentTemplates.map((template) => (
                <button
                  key={template.name}
                  type="button"
                  onClick={openWorkspace}
                  className="group text-left rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card hover:border-accent/40 hover:shadow-sm transition-all p-4 flex flex-col min-h-[128px]"
                >
                  <span className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-4", template.bgColor)}>
                    <template.icon className={cn("w-4 h-4", template.color)} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-gray-900 dark:text-foreground">{template.name}</span>
                    <span className="block text-xs text-gray-500 dark:text-muted-foreground mt-0.5">{template.description}</span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-accent self-end mt-2 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-foreground">Recent documents</h2>
          <button type="button" className="text-xs font-medium text-accent hover:underline">
            View all
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_140px_170px_28px] gap-4 px-5 py-2.5 border-b border-gray-100 dark:border-border text-xs font-medium text-gray-400">
            <span>Name</span>
            <span>Last modified</span>
            <span>Type</span>
            <span />
          </div>
          {recentDocuments.map((doc, i) => (
            <button
              key={doc.name}
              type="button"
              onClick={openWorkspace}
              className={cn(
                "w-full grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_140px_170px_28px] gap-2 sm:gap-4 items-center px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-secondary/50 transition-colors",
                i !== recentDocuments.length - 1 && "border-b border-gray-100 dark:border-border",
              )}
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", doc.bgColor)}>
                  <doc.icon className={cn("w-4 h-4", doc.color)} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900 dark:text-foreground truncate">{doc.name}</span>
                  <span className="block text-xs text-gray-400">{doc.status}</span>
                </span>
              </span>
              <span className="hidden sm:block text-xs text-gray-500 dark:text-muted-foreground">{doc.lastModified}</span>
              <span className="hidden sm:block">
                <span className={cn("inline-flex items-center rounded-full text-[11px] font-medium px-2 py-0.5", doc.bgColor, doc.color)}>
                  {doc.type}
                </span>
              </span>
              <MoreHorizontal className="hidden sm:block w-4 h-4 text-gray-300 justify-self-end" />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
