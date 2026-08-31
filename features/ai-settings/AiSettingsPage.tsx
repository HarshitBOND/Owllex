"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlignLeft, ArrowLeft, CalendarRange, ChevronDown, CircleDollarSign, Cpu, FileText,
  Gauge, Globe, History, Landmark, List, LucideIcon, MessageSquare, PenLine, Quote,
  Scale, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles,
} from "lucide-react"
import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import { cn } from "@/lib/utils"

type Section = {
  id: string
  name: string
  icon: LucideIcon
  title: string
  description: string
  groups: {
    rows: {
      icon: LucideIcon
      tint: string
      label: string
      hint: string
      selects?: { key: string; options: string[] }[]
      toggles?: { key: string; label: string; hint: string }[]
    }[]
  }[]
}

const sections: Section[] = [
  {
    id: "model",
    name: "Model",
    icon: Cpu,
    title: "Model",
    description: "Pick the engine and how it should generate answers.",
    groups: [
      {
        rows: [
          {
            icon: Sparkles,
            tint: "bg-emerald-50 text-emerald-600",
            label: "Default model",
            hint: "Model used for new chats, drafts and reviews.",
            selects: [{ key: "model", options: ["Lexvert Pro (most capable)", "Lexvert Balanced", "Lexvert Fast"] }],
          },
          {
            icon: AlignLeft,
            tint: "bg-indigo-50 text-indigo-600",
            label: "Response length",
            hint: "How much detail the assistant returns by default.",
            selects: [{ key: "length", options: ["Balanced", "Concise", "Detailed"] }],
          },
          {
            icon: Gauge,
            tint: "bg-blue-50 text-blue-600",
            label: "Creativity",
            hint: "Lower stays close to the source, higher explores more.",
            selects: [{ key: "creativity", options: ["Precise", "Balanced", "Creative"] }],
          },
        ],
      },
      {
        rows: [
          {
            icon: Settings2,
            tint: "bg-teal-50 text-teal-600",
            label: "Generation settings",
            hint: "Control how answers are produced.",
            toggles: [
              { key: "thinking", label: "Extended thinking", hint: "Let the model reason longer on complex questions" },
              { key: "stream", label: "Stream responses", hint: "Show the answer as it is being written" },
              { key: "retry", label: "Auto-retry failures", hint: "Retry once if a request fails midway" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "behaviour",
    name: "Behaviour",
    icon: SlidersHorizontal,
    title: "Behaviour",
    description: "Set the voice, language and shape of every answer.",
    groups: [
      {
        rows: [
          {
            icon: MessageSquare,
            tint: "bg-emerald-50 text-emerald-600",
            label: "Tone of voice",
            hint: "Choose how the assistant addresses you.",
            selects: [{ key: "tone", options: ["Neutral professional", "Formal legal", "Plain conversational"] }],
          },
          {
            icon: Globe,
            tint: "bg-indigo-50 text-indigo-600",
            label: "Answer language",
            hint: "Preferred language for AI responses.",
            selects: [{ key: "language", options: ["English (India)", "English (UK)", "Hindi", "Marathi"] }],
          },
          {
            icon: List,
            tint: "bg-blue-50 text-blue-600",
            label: "Output format",
            hint: "Default structure for longer answers.",
            selects: [{ key: "format", options: ["Mixed", "Paragraphs", "Bullet points"] }],
          },
        ],
      },
      {
        rows: [
          {
            icon: Settings2,
            tint: "bg-teal-50 text-teal-600",
            label: "Answer defaults",
            hint: "What every response should include.",
            toggles: [
              { key: "cite", label: "Always cite sources", hint: "Attach statute and judgment references" },
              { key: "clarify", label: "Ask clarifying questions", hint: "Check missing facts before answering" },
              { key: "risk", label: "Flag legal risks", hint: "Call out risky clauses and assumptions" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "drafting",
    name: "Drafting",
    icon: PenLine,
    title: "Drafting",
    description: "Defaults applied when the AI writes a new document.",
    groups: [
      {
        rows: [
          {
            icon: FileText,
            tint: "bg-orange-50 text-orange-600",
            label: "Default document type",
            hint: "Select the default type when creating a new document.",
            selects: [{ key: "docType", options: ["Rental Agreement", "Non-Disclosure Agreement", "Employment Contract", "Service Agreement"] }],
          },
          {
            icon: Scale,
            tint: "bg-indigo-50 text-indigo-600",
            label: "Governing jurisdiction",
            hint: "Law applied to generated clauses.",
            selects: [{ key: "jurisdiction", options: ["Delhi", "Maharashtra", "Karnataka", "Central (India)"] }],
          },
        ],
      },
      {
        rows: [
          {
            icon: Settings2,
            tint: "bg-teal-50 text-teal-600",
            label: "Default drafting settings",
            hint: "Set your preferred options for new drafts.",
            toggles: [
              { key: "placeholders", label: "Insert placeholders", hint: "Mark missing details as fill-in fields" },
              { key: "definitions", label: "Include definitions section", hint: "Add a defined-terms block to every draft" },
              { key: "numbering", label: "Auto-number clauses", hint: "Apply consistent clause numbering" },
            ],
          },
        ],
      },
      {
        rows: [
          {
            icon: CircleDollarSign,
            tint: "bg-emerald-50 text-emerald-600",
            label: "Units & currency",
            hint: "Set your preferred currency and measurement units.",
            selects: [
              { key: "currency", options: ["INR (₹)", "USD ($)", "EUR (€)"] },
              { key: "units", options: ["Metric (kg, cm, m)", "Imperial (lb, in, ft)"] },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "research",
    name: "Research",
    icon: Search,
    title: "Research",
    description: "How case law and citations are searched and shown.",
    groups: [
      {
        rows: [
          {
            icon: Quote,
            tint: "bg-blue-50 text-blue-600",
            label: "Citation style",
            hint: "Format used when quoting judgments.",
            selects: [{ key: "citation", options: ["SCC", "AIR", "Neutral citation"] }],
          },
          {
            icon: Landmark,
            tint: "bg-emerald-50 text-emerald-600",
            label: "Court priority",
            hint: "Which courts to surface first in results.",
            selects: [{ key: "courts", options: ["Supreme Court first", "High Courts first", "All courts equally"] }],
          },
          {
            icon: CalendarRange,
            tint: "bg-orange-50 text-orange-600",
            label: "Judgment recency",
            hint: "Limit results to a time window.",
            selects: [{ key: "recency", options: ["Last 10 years", "Last 5 years", "No limit"] }],
          },
        ],
      },
      {
        rows: [
          {
            icon: Settings2,
            tint: "bg-teal-50 text-teal-600",
            label: "Result defaults",
            hint: "What to include with every research result.",
            toggles: [
              { key: "confidence", label: "Show confidence score", hint: "Display how sure the AI is about a match" },
              { key: "overruled", label: "Highlight overruled judgments", hint: "Warn when precedent is no longer good law" },
              { key: "headnotes", label: "Include headnotes", hint: "Show the summary alongside each judgment" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "privacy",
    name: "Data & Privacy",
    icon: ShieldCheck,
    title: "Data & Privacy",
    description: "Control what the AI keeps and what it sends.",
    groups: [
      {
        rows: [
          {
            icon: History,
            tint: "bg-indigo-50 text-indigo-600",
            label: "Chat history retention",
            hint: "How long AI conversations are stored.",
            selects: [{ key: "retention", options: ["90 days", "30 days", "1 year", "Keep forever"] }],
          },
          {
            icon: ShieldCheck,
            tint: "bg-emerald-50 text-emerald-600",
            label: "Data region",
            hint: "Where your AI data is processed and stored.",
            selects: [{ key: "region", options: ["India (Mumbai)", "Singapore"] }],
          },
        ],
      },
      {
        rows: [
          {
            icon: Settings2,
            tint: "bg-teal-50 text-teal-600",
            label: "Data usage",
            hint: "Decide what leaves your workspace.",
            toggles: [
              { key: "improve", label: "Use my documents to improve suggestions", hint: "Personalise results from your own files" },
              { key: "redact", label: "Redact client names", hint: "Strip identifying names before sending a prompt" },
              { key: "localOnly", label: "Store drafts on this device only", hint: "Keep unsaved drafts out of the cloud" },
            ],
          },
        ],
      },
    ],
  },
]

const defaultToggles: Record<string, boolean> = {
  thinking: true, stream: true, retry: true,
  cite: true, clarify: true, risk: true,
  placeholders: true, definitions: false, numbering: true,
  confidence: true, overruled: true, headnotes: false,
  improve: false, redact: true, localOnly: false,
}

export default function AiSettingsPage() {
  const router = useRouter()
  const [activeId, setActiveId] = useState("model")
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [toggles, setToggles] = useState(defaultToggles)

  const active = sections.find((section) => section.id === activeId) ?? sections[0]

  return (
    <div className="flex">
      <Sidebar />
      <div
        className={cn(
          "bg-[#F3F5F9] dark:bg-background min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0",
          "lg:ml-[var(--sidebar-offset)]",
        )}
      >
        <div className="px-3 sm:px-4 md:px-6 pt-3 md:pt-4">
          <Navbar location="AI Settings" subtitle="Tune how the assistant thinks, writes and researches for you." />
        </div>

        <div className="px-3 sm:px-4 md:px-6 pb-6 pt-4 flex flex-col lg:flex-row gap-4 lg:gap-8">
          <aside className="lg:w-72 shrink-0">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-foreground">AI Settings</h1>
            <p className="text-sm text-gray-500 dark:text-muted-foreground mt-1">
              Manage your assistant and its default behaviour.
            </p>

            <nav className="mt-6 flex lg:flex-col gap-1 overflow-x-auto pb-1">
              {sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveId(section.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                    section.id === activeId
                      ? "bg-accent/10 text-accent"
                      : "text-gray-600 dark:text-muted-foreground hover:bg-white dark:hover:bg-card",
                  )}
                >
                  <section.icon className="w-4 h-4" />
                  {section.name}
                </button>
              ))}
            </nav>
          </aside>

          <section className="flex-1 min-w-0">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="mt-1 text-gray-400 hover:text-gray-700 dark:hover:text-foreground transition-colors"
                aria-label="Go back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-foreground">{active.title}</h2>
                <p className="text-sm text-gray-500 dark:text-muted-foreground mt-1">{active.description}</p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-4">
              {active.groups.map((group, groupIndex) => (
                <div
                  key={groupIndex}
                  className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card divide-y divide-gray-100 dark:divide-border"
                >
                  {group.rows.map((row) => (
                    <div key={row.label} className="p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                        <span className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", row.tint)}>
                          <row.icon className="w-4 h-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-foreground">{row.label}</p>
                          <p className="text-xs text-gray-500 dark:text-muted-foreground mt-0.5">{row.hint}</p>
                        </div>
                        {row.selects && (
                          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                            {row.selects.map((select) => (
                              <div key={select.key} className="relative">
                                <select
                                  value={choices[select.key] ?? select.options[0]}
                                  onChange={(event) => setChoices({ ...choices, [select.key]: event.target.value })}
                                  className="h-10 w-full sm:w-52 appearance-none rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-input pl-3 pr-9 text-sm text-gray-800 dark:text-foreground hover:border-accent/40 focus:border-accent focus:outline-none transition-colors"
                                >
                                  {select.options.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {row.toggles && (
                        <div className="mt-4 sm:pl-13">
                          {row.toggles.map((item) => (
                            <div key={item.key} className="flex items-center gap-4 py-2.5">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-foreground">{item.label}</p>
                                <p className="text-xs text-gray-500 dark:text-muted-foreground mt-0.5">{item.hint}</p>
                              </div>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={toggles[item.key]}
                                aria-label={item.label}
                                onClick={() => setToggles({ ...toggles, [item.key]: !toggles[item.key] })}
                                className={cn(
                                  "relative w-11 h-6 rounded-full shrink-0 transition-colors",
                                  toggles[item.key] ? "bg-accent" : "bg-gray-200 dark:bg-secondary",
                                )}
                              >
                                <span
                                  className={cn(
                                    "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform",
                                    toggles[item.key] && "translate-x-5",
                                  )}
                                />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
