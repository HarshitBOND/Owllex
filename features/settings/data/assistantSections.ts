import {
  Cpu, PenLine, Search, ShieldCheck, SlidersHorizontal, type LucideIcon,
} from "lucide-react"

export type AssistantField =
  | { kind: "select"; key: string; label: string; hint: string; options: string[] }
  | { kind: "toggle"; key: string; label: string; hint: string }

export type AssistantSection = {
  id: string
  name: string
  icon: LucideIcon
  title: string
  description: string
  groups: { title?: string; fields: AssistantField[] }[]
}

export const assistantSections: AssistantSection[] = [
  {
    id: "model",
    name: "Model",
    icon: Cpu,
    title: "Model",
    description: "Pick the engine and how it should generate answers.",
    groups: [
      {
        fields: [
          {
            kind: "select",
            key: "model",
            label: "Default model",
            hint: "Model used for new chats, drafts and reviews.",
            options: ["Ravenslaw Pro (most capable)", "Ravenslaw Balanced", "Ravenslaw Fast"],
          },
          {
            kind: "select",
            key: "length",
            label: "Response length",
            hint: "How much detail the assistant returns by default.",
            options: ["Balanced", "Concise", "Detailed"],
          },
          {
            kind: "select",
            key: "creativity",
            label: "Creativity",
            hint: "Lower stays close to the source, higher explores more.",
            options: ["Precise", "Balanced", "Creative"],
          },
        ],
      },
      {
        title: "Generation",
        fields: [
          { kind: "toggle", key: "thinking", label: "Extended thinking", hint: "Let the model reason longer on complex questions." },
          { kind: "toggle", key: "stream", label: "Stream responses", hint: "Show the answer as it is being written." },
          { kind: "toggle", key: "retry", label: "Auto-retry failures", hint: "Retry once if a request fails midway." },
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
        fields: [
          {
            kind: "select",
            key: "tone",
            label: "Tone of voice",
            hint: "Choose how the assistant addresses you.",
            options: ["Neutral professional", "Formal legal", "Plain conversational"],
          },
          {
            kind: "select",
            key: "language",
            label: "Answer language",
            hint: "Preferred language for AI responses.",
            options: ["English (India)", "English (UK)", "Hindi", "Marathi"],
          },
          {
            kind: "select",
            key: "format",
            label: "Output format",
            hint: "Default structure for longer answers.",
            options: ["Mixed", "Paragraphs", "Bullet points"],
          },
        ],
      },
      {
        title: "Answer defaults",
        fields: [
          { kind: "toggle", key: "cite", label: "Always cite sources", hint: "Attach statute and judgment references." },
          { kind: "toggle", key: "clarify", label: "Ask clarifying questions", hint: "Check missing facts before answering." },
          { kind: "toggle", key: "risk", label: "Flag legal risks", hint: "Call out risky clauses and assumptions." },
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
        fields: [
          {
            kind: "select",
            key: "docType",
            label: "Default document type",
            hint: "Selected by default when creating a new document.",
            options: ["Rental Agreement", "Non-Disclosure Agreement", "Employment Contract", "Service Agreement"],
          },
          {
            kind: "select",
            key: "jurisdiction",
            label: "Governing jurisdiction",
            hint: "Law applied to generated clauses.",
            options: ["Delhi", "Maharashtra", "Karnataka", "Central (India)"],
          },
          {
            kind: "select",
            key: "currency",
            label: "Document currency",
            hint: "Currency used for amounts written into drafts.",
            options: ["INR (₹)", "USD ($)", "EUR (€)"],
          },
          {
            kind: "select",
            key: "units",
            label: "Measurement units",
            hint: "Units used for areas and dimensions in drafts.",
            options: ["Metric (kg, cm, m)", "Imperial (lb, in, ft)"],
          },
        ],
      },
      {
        title: "Draft defaults",
        fields: [
          { kind: "toggle", key: "placeholders", label: "Insert placeholders", hint: "Mark missing details as fill-in fields." },
          { kind: "toggle", key: "definitions", label: "Include definitions section", hint: "Add a defined-terms block to every draft." },
          { kind: "toggle", key: "numbering", label: "Auto-number clauses", hint: "Apply consistent clause numbering." },
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
        fields: [
          {
            kind: "select",
            key: "citation",
            label: "Citation style",
            hint: "Format used when quoting judgments.",
            options: ["SCC", "AIR", "Neutral citation"],
          },
          {
            kind: "select",
            key: "courts",
            label: "Court priority",
            hint: "Which courts to surface first in results.",
            options: ["Supreme Court first", "High Courts first", "All courts equally"],
          },
          {
            kind: "select",
            key: "recency",
            label: "Judgment recency",
            hint: "Limit results to a time window.",
            options: ["Last 10 years", "Last 5 years", "No limit"],
          },
        ],
      },
      {
        title: "Result defaults",
        fields: [
          { kind: "toggle", key: "confidence", label: "Show confidence score", hint: "Display how sure the AI is about a match." },
          { kind: "toggle", key: "overruled", label: "Highlight overruled judgments", hint: "Warn when precedent is no longer good law." },
          { kind: "toggle", key: "headnotes", label: "Include headnotes", hint: "Show the summary alongside each judgment." },
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
        fields: [
          {
            kind: "select",
            key: "retention",
            label: "Chat history retention",
            hint: "How long AI conversations are stored.",
            options: ["90 days", "30 days", "1 year", "Keep forever"],
          },
          {
            kind: "select",
            key: "region",
            label: "Data region",
            hint: "Where your AI data is processed and stored.",
            options: ["India (Mumbai)", "Singapore"],
          },
        ],
      },
      {
        title: "Data usage",
        fields: [
          { kind: "toggle", key: "improve", label: "Use my documents to improve suggestions", hint: "Personalise results from your own files." },
          { kind: "toggle", key: "redact", label: "Redact client names", hint: "Strip identifying names before sending a prompt." },
          { kind: "toggle", key: "localOnly", label: "Store drafts on this device only", hint: "Keep unsaved drafts out of the cloud." },
        ],
      },
    ],
  },
]

export const defaultAssistantToggles: Record<string, boolean> = {
  thinking: true, stream: true, retry: true,
  cite: true, clarify: true, risk: true,
  placeholders: true, definitions: false, numbering: true,
  confidence: true, overruled: true, headnotes: false,
  improve: false, redact: true, localOnly: false,
}
