"use client"

import { useEffect, useState } from "react"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import RedlineView from "@/components/common/revisions/RedlineView"
import StarterKit from "@tiptap/starter-kit"
import TextAlign from "@tiptap/extension-text-align"
import CharacterCount from "@tiptap/extension-character-count"
import { TableKit } from "@tiptap/extension-table"
import {
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  Download,
  FileText,
  Italic,
  Link as LinkIcon,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Plus,
  Redo2,
  RotateCcw,
  Sparkles,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
  Vault,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { useSaveToVault } from "@/features/vault/useSaveToVault"
import type { SaveStatus } from "../hooks/useDraftAutosave"

interface DocumentEditorPanelProps {
  draftId: string
  initialContent: string
  title: string
  onTitleChange: (title: string) => void
  typography: { fontFamily: string; fontSizePt: number }
  onTypographyChange: (typography: { fontFamily: string; fontSizePt: number }) => void
  saveStatus: SaveStatus
  onRetrySave: () => void
  onContentChange: (html: string, words: number) => void
  onEditorReady: (editor: Editor) => void
  beforeExport: () => Promise<void>
  /** Set when this document came from an imported court form, so the original stays reachable. */
  templateId?: string | null
  templateVersion?: number
  hasSourcePdf?: boolean
  assistantOpen: boolean
  onOpenAssistant: () => void
  /** Renders the tracked-changes diff instead of the editor while true. */
  showEdits?: boolean
  redlineHtml?: string
}

const paragraphStyles = [
  { label: "Normal Text", value: "paragraph" },
  { label: "Heading 1", value: "h1" },
  { label: "Heading 2", value: "h2" },
  { label: "Heading 3", value: "h3" },
]

const fontFamilies = ["Georgia", "Times New Roman", "Arial", "Inter"]
const fontSizes = [10, 11, 12, 14, 16, 18]

function ToolbarDivider() {
  return <div className="w-px h-5 bg-gray-200 dark:bg-border mx-1 shrink-0" />
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-7 h-7 shrink-0 rounded-md flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active
          ? "bg-accent/10 text-accent"
          : "text-gray-600 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  )
}

export default function DocumentEditorPanel({
  draftId,
  initialContent,
  title,
  onTitleChange,
  typography,
  onTypographyChange,
  saveStatus,
  onRetrySave,
  onContentChange,
  onEditorReady,
  beforeExport,
  templateId,
  templateVersion,
  hasSourcePdf,
  assistantOpen,
  onOpenAssistant,
  showEdits = false,
  redlineHtml = "",
}: DocumentEditorPanelProps) {
  const [openingSource, setOpeningSource] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const [zoom, setZoom] = useState(100)
  const [shareLabel, setShareLabel] = useState("Copy link")
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null)
  const saveToVault = useSaveToVault()

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TableKit.configure({ table: { resizable: false } }),
      CharacterCount,
    ],
    content: initialContent,
    immediatelyRender: false,
    editorProps: { attributes: { class: "draft-doc-editor focus:outline-none" } },
    onUpdate: ({ editor }) => {
      const words = editor.storage.characterCount.words()
      setWordCount(words)
      onContentChange(editor.getHTML(), words)
    },
  })

  useEffect(() => {
    if (!editor) return
    setWordCount(editor.storage.characterCount.words())
    onEditorReady(editor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  if (!editor) {
    return (
      <div className="flex-1 min-h-0 h-[70vh] lg:h-full flex items-center justify-center rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card">
        <div className="w-8 h-8 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
      </div>
    )
  }

  const currentParagraphStyle =
    paragraphStyles.find((p) =>
      p.value === "paragraph"
        ? editor.isActive("paragraph")
        : editor.isActive("heading", { level: Number(p.value[1]) })
    ) ?? paragraphStyles[0]

  const setParagraphStyle = (value: string) => {
    if (value === "paragraph") editor.chain().focus().setParagraph().run()
    else
      editor
        .chain()
        .focus()
        .toggleHeading({ level: Number(value[1]) as 1 | 2 | 3 })
        .run()
  }

  const setLink = () => {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const url = window.prompt("Link URL")
    if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }

  /**
   * Opens the court's own blank form in a new tab.
   *
   * The link is signed and short-lived, so it is fetched at the moment it is
   * needed rather than embedded in the page and left to go stale.
   */
  const openSourcePdf = async () => {
    if (!templateId) return
    setOpeningSource(true)
    try {
      const query = templateVersion ? `?version=${templateVersion}` : ""
      const res = await fetch(`/api/document-templates/${templateId}/source${query}`)
      const data = await res.json()
      if (data.success) window.open(data.url, "_blank", "noopener,noreferrer")
    } catch {
      // Nothing to recover: the draft itself is unaffected, and the form is
      // still reachable from the template library.
    } finally {
      setOpeningSource(false)
    }
  }

  /**
   * Downloads as a blob rather than navigating to the URL.
   *
   * A stamped PDF can come back with warnings -- a name shortened to fit the
   * court's box, or more parties than the printed form has rows for. Those
   * travel in a response header, and a plain navigation would throw them away:
   * the advocate would get a document that looks finished and is quietly
   * missing half a party's name.
   */
  const exportAs = async (format: "pdf" | "docx") => {
    setExporting(format)
    try {
      await beforeExport()

      const res = await fetch(`/api/draft-documents/${draftId}/export?format=${format}`)
      if (!res.ok) {
        toast.error("That document could not be exported.")
        return
      }

      const rawWarnings = res.headers.get("X-Stamp-Warnings")
      const blob = await res.blob()

      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${(title || "document").replace(/[^\w\s.-]+/g, "").trim() || "document"}.${format}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      if (rawWarnings) {
        try {
          const warnings = JSON.parse(decodeURIComponent(rawWarnings)) as {
            label: string
            reason: string
          }[]
          toast.warning(
            warnings.length === 1
              ? "One value did not fit the court's form"
              : `${warnings.length} values did not fit the court's form`,
            {
              description: warnings.map((w) => `${w.label} ${w.reason}`).join(" · "),
              duration: 12000,
            }
          )
        } catch {
          // A malformed header must not stop a download that already succeeded.
        }
      }
    } catch {
      toast.error("That document could not be exported.")
    } finally {
      setExporting(null)
    }
  }

  const saveToVaultAs = async (format: "pdf" | "docx") => {
    await beforeExport()
    await saveToVault.save(`/api/draft-documents/${draftId}/save-to-vault?format=${format}`)
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareLabel("Copied")
    } catch {
      setShareLabel("Copy failed")
    }
    setTimeout(() => setShareLabel("Copy link"), 1500)
  }

  const statusLine =
    saveStatus === "saving" ? (
      <span className="flex items-center gap-1 text-gray-500 dark:text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Saving…
      </span>
    ) : saveStatus === "error" ? (
      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
        <AlertTriangle className="w-3.5 h-3.5" />
        Couldn&apos;t save
        <button type="button" onClick={onRetrySave} className="underline font-medium">
          Retry
        </button>
      </span>
    ) : saveStatus === "conflict" ? (
      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
        <AlertTriangle className="w-3.5 h-3.5" />
        Not saving opened elsewhere
      </span>
    ) : (
      <span className="flex items-center gap-1 text-brand-600 dark:text-accent">
        <Check className="w-3.5 h-3.5" />
        All changes saved
      </span>
    )

  return (
    <div className="flex-1 min-w-0 h-[70vh] lg:h-full flex flex-col rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-border shrink-0">
        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            onBlur={(e) => {
              if (!e.target.value.trim()) onTitleChange("Untitled document")
            }}
            maxLength={200}
            aria-label="Document title"
            className="w-full font-serif text-lg sm:text-xl font-semibold text-gray-900 dark:text-foreground bg-transparent border-none outline-none focus:ring-0 truncate p-0"
          />
          <p className="mt-1 text-[12px]">{statusLine}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!assistantOpen && (
            <button
              type="button"
              onClick={onOpenAssistant}
              title="Open the AI assistant"
              className="h-8 px-3 rounded-lg border border-gray-200 dark:border-border flex items-center gap-1.5 text-[13px] font-medium text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-secondary transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Ask AI
            </button>
          )}
          <button
            type="button"
            title="Undo"
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
            className="w-8 h-8 rounded-lg border border-gray-200 dark:border-border flex items-center justify-center text-gray-500 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Redo"
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
            className="w-8 h-8 rounded-lg border border-gray-200 dark:border-border flex items-center justify-center text-gray-500 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-8 px-3 rounded-lg border border-gray-200 dark:border-border flex items-center gap-1.5 text-[13px] font-medium text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-secondary transition-colors"
              >
                {exporting || saveToVault.state === "saving" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Download
                <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportAs("pdf")}>PDF (.pdf)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportAs("docx")}>Word (.docx)</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => saveToVaultAs("pdf")}>
                <Vault className="mr-2 h-3.5 w-3.5" />
                Save PDF to Vault
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => saveToVaultAs("docx")}>
                <Vault className="mr-2 h-3.5 w-3.5" />
                Save Word to Vault
              </DropdownMenuItem>
              {hasSourcePdf && templateId && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={openSourcePdf} disabled={openingSource}>
                    {openingSource ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileText className="mr-2 h-3.5 w-3.5" />
                    )}
                    The court&apos;s original form
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={copyLink}
            className="h-8 px-3 rounded-lg bg-accent text-white flex items-center gap-1.5 text-[13px] font-medium hover:bg-accent-hover transition-colors"
          >
            <Link2 className="w-3.5 h-3.5" />
            {shareLabel}
          </button>
        </div>
      </div>

      {/* Inert while the redline is up -- see the note in ContractDocumentPanel. */}
      <div
        aria-hidden={showEdits}
        className={`flex items-center gap-1 px-4 py-2 border-b border-gray-200 dark:border-border overflow-x-auto shrink-0 ${
          showEdits ? "pointer-events-none opacity-40" : ""
        }`}
      >
        <ToolbarButton
          title="Clear formatting"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        >
          <RotateCcw className="w-4 h-4" />
        </ToolbarButton>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="h-7 px-2 rounded-md flex items-center gap-1 text-[12.5px] text-gray-700 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors shrink-0"
            >
              {currentParagraphStyle.label}
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {paragraphStyles.map((style) => (
              <DropdownMenuItem key={style.value} onClick={() => setParagraphStyle(style.value)}>
                {style.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="h-7 px-2 rounded-md flex items-center gap-1 text-[12.5px] text-gray-700 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors shrink-0"
            >
              {typography.fontFamily}
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {fontFamilies.map((font) => (
              <DropdownMenuItem key={font} onClick={() => onTypographyChange({ ...typography, fontFamily: font })}>
                {font}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="h-7 px-2 rounded-md flex items-center gap-1 text-[12.5px] text-gray-700 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors shrink-0"
            >
              {typography.fontSizePt}
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {fontSizes.map((size) => (
              <DropdownMenuItem key={size} onClick={() => onTypographyChange({ ...typography, fontSizePt: size })}>
                {size}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <ToolbarDivider />

        <ToolbarButton title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton title="Link" active={editor.isActive("link")} onClick={setLink}>
          <LinkIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Insert table"
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <TableIcon className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title="Align left"
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Align centre"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Align right"
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight className="w-4 h-4" />
        </ToolbarButton>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-[#F8F9FB] dark:bg-background/40 px-4 py-8">
        <div
          className="mx-auto max-w-[760px] origin-top bg-white dark:bg-card shadow-sm border border-gray-200 dark:border-border"
          style={{ zoom: `${zoom}%` }}
        >
          {showEdits ? (
            <RedlineView
              html={redlineHtml}
              style={{ fontFamily: typography.fontFamily, fontSize: `${typography.fontSizePt}pt` }}
              className="px-12 py-14"
            />
          ) : (
            <EditorContent
              editor={editor}
              style={{ fontFamily: typography.fontFamily, fontSize: `${typography.fontSizePt}pt` }}
              className="px-12 py-14"
            />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-2 border-t border-gray-200 dark:border-border text-[12px] text-muted-foreground shrink-0">
        <div className="flex items-center gap-3">
          <span>{wordCount.toLocaleString()} words</span>
          <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-border" />
          <span>English (India)</span>
          <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-border" />
          {statusLine}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Zoom out"
            onClick={() => setZoom((z) => Math.max(50, z - 10))}
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="w-9 text-center">{zoom}%</span>
          <button
            type="button"
            title="Zoom in"
            onClick={() => setZoom((z) => Math.min(150, z + 10))}
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
