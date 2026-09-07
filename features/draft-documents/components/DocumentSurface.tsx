"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import TextAlign from "@tiptap/extension-text-align"
import CharacterCount from "@tiptap/extension-character-count"
import { TableKit } from "@tiptap/extension-table"
import RedlineView from "@/components/common/revisions/RedlineView"
import RedlineApprovalBar from "@/components/common/revisions/RedlineApprovalBar"
import InlineEditComposer from "@/components/common/revisions/InlineEditComposer"
import { SelectionPin } from "@/components/common/revisions/selectionPinExtension"
import { RevisionOverlay } from "@/components/common/revisions/revisionOverlayExtension"
import {
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronLeft,
  Download,
  FileText,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  MoreHorizontal,
  Redo2,
  Sparkles,
  Table as TableIcon,
  Type,
  Undo2,
  Vault,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { useSaveToVault } from "@/features/vault/useSaveToVault"
import { resolveDraftFont } from "@/lib/documents/draftFont"
import type { RevisionSelection } from "@/hooks/useRevisions"
import type { SaveStatus } from "../hooks/useDraftAutosave"

interface DocumentSurfaceProps {
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
  /** Masthead facts, straight from the loaded draft. */
  status?: "draft" | "final"
  updatedAt?: string
  templateTitle?: string
  /** Renders the tracked-changes diff in place of the editor while true. */
  showEdits?: boolean
  redlineHtml?: string
  /** True while a revision is still arriving, which the redline animates through. */
  streaming?: boolean
  /** The in-document instruction box. */
  selection?: RevisionSelection | null
  onAddRevision?: (instruction: string) => void
  revisionBusy?: boolean
  /** A generated revision waiting on Approve/Reject before it reaches the document. */
  hasPendingApproval?: boolean
  pendingApprovalInstruction?: string | null
  onApproveRevision?: () => void
  onRejectRevision?: () => void
  /** The passage the in-flight/awaiting revision is scoped to, if any -- see useRevisions. */
  activeScope?: RevisionSelection | null
  /** The scoped diff to show in place of that passage, instead of swapping the whole document. */
  passageRedlineHtml?: string
  onOpenAssistant: () => void
  /** The metadata column, rendered beside the document. */
  rail: React.ReactNode
}

const fontFamilies = ["Poppins", "Inter", "Times New Roman", "Arial"]
const fontSizes = [10, 11, 12, 14, 16, 18]

/**
 * What each stored typeface actually renders as.
 *
 * "Georgia" was the schema default before drafts were set in Poppins, so it
 * means "nobody chose a typeface" rather than "somebody chose Georgia" -- and
 * it is no longer offered in the menu, so it can only ever be that.
 */
const FONT_STACKS: Record<string, string> = {
  Poppins: "var(--font-poppins), ui-sans-serif, system-ui, sans-serif",
  Georgia: "var(--font-poppins), ui-sans-serif, system-ui, sans-serif",
  Inter: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  "Times New Roman": "'Times New Roman', Times, serif",
  Arial: "Arial, Helvetica, sans-serif",
}

const resolveFont = (family: string) => FONT_STACKS[resolveDraftFont(family)] ?? family
const displayFont = (family: string) => resolveDraftFont(family)

function formatUpdated(value?: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

function Dot() {
  return <span aria-hidden className="px-1.5 text-gray-300 dark:text-border">·</span>
}

export default function DocumentSurface({
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
  status = "draft",
  updatedAt,
  templateTitle,
  showEdits = false,
  redlineHtml = "",
  streaming = false,
  selection = null,
  onAddRevision,
  revisionBusy = false,
  hasPendingApproval = false,
  pendingApprovalInstruction = null,
  onApproveRevision,
  onRejectRevision,
  activeScope = null,
  passageRedlineHtml = "",
  onOpenAssistant,
  rail,
}: DocumentSurfaceProps) {
  const [openingSource, setOpeningSource] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null)
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  const saveToVault = useSaveToVault()

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TableKit.configure({ table: { resizable: false } }),
      CharacterCount,
      SelectionPin,
      RevisionOverlay,
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

  // A scoped revision shows in place of the passage it targets -- the rest of
  // the document, and the reader's scroll position in it, never moves. See
  // revisionOverlayExtension.ts for why this is safe to do with a decoration
  // rather than editing the document.
  const scopedActive = Boolean(activeScope) && (revisionBusy || hasPendingApproval)

  useEffect(() => {
    if (!editor) return
    if (scopedActive && activeScope && passageRedlineHtml) {
      editor.commands.showRevisionOverlay({
        from: activeScope.from,
        to: activeScope.to,
        html: passageRedlineHtml,
        streaming: revisionBusy,
      })
    } else {
      editor.commands.clearRevisionOverlay()
    }
  }, [editor, scopedActive, activeScope, passageRedlineHtml, revisionBusy])

  // Typing over a passage the overlay is standing in for would desync the two
  // -- the document can't change while its position is what the overlay (and
  // the pending revision on the server) is keyed to.
  useEffect(() => {
    editor?.setEditable(!scopedActive)
  }, [editor, scopedActive])

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
      // Nothing to recover: the draft is unaffected and the form is still
      // reachable from the template library.
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
          const warnings = JSON.parse(decodeURIComponent(rawWarnings)) as { label: string; reason: string }[]
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
      setCopied(true)
    } catch {
      toast.error("That link could not be copied.")
      return
    }
    setTimeout(() => setCopied(false), 1500)
  }

  const savedLabel =
    saveStatus === "saving" ? (
      <span className="text-gray-400 dark:text-muted-foreground">Saving…</span>
    ) : saveStatus === "error" ? (
      <button type="button" onClick={onRetrySave} className="text-amber-600 dark:text-amber-400 underline cursor-pointer">
        Couldn&apos;t save — retry
      </button>
    ) : saveStatus === "conflict" ? (
      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
        <AlertTriangle className="w-3 h-3" />
        Opened elsewhere
      </span>
    ) : (
      <span className="text-gray-400 dark:text-muted-foreground">Saved</span>
    )

  const showRedline = showEdits && redlineHtml.trim().length > 0
  const updatedLabel = formatUpdated(updatedAt)
  // 200 wpm, the rate a reading time is conventionally quoted at.
  const readingMinutes = Math.max(1, Math.round(wordCount / 200))

  return (
    <div className="h-full flex flex-col bg-white dark:bg-background">
      <header className="shrink-0 border-b border-gray-200 dark:border-border px-5 sm:px-8 py-3.5">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <Link
              href="/draft-documents"
              className="inline-flex items-center gap-1 text-[12.5px] text-gray-500 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Draft documents
            </Link>

            <input
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              onBlur={(event) => {
                if (!event.target.value.trim()) onTitleChange("Untitled document")
              }}
              maxLength={200}
              aria-label="Document title"
              className="mt-0.5 w-full truncate bg-transparent p-0 font-serif text-[20px] sm:text-[22px] font-semibold leading-tight tracking-[-0.01em] text-gray-900 dark:text-foreground outline-none focus:ring-0"
            />

            <div className="mt-1 flex flex-wrap items-center text-[11.5px] text-gray-400 dark:text-muted-foreground">
              <span className="capitalize">{status}</span>
              {updatedLabel && (
                <>
                  <Dot />
                  <span>{updatedLabel}</span>
                </>
              )}
              <Dot />
              <span>{readingMinutes} minute{readingMinutes === 1 ? "" : "s"}</span>
              {templateTitle && (
                <>
                  <Dot />
                  <span className="truncate max-w-[280px] text-gray-500 dark:text-muted-foreground">
                    {templateTitle}
                  </span>
                </>
              )}
              <Dot />
              {savedLabel}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-3">
            <button
              type="button"
              onClick={onOpenAssistant}
              className="h-8 px-2.5 rounded-md flex items-center gap-1.5 text-[13px] font-medium text-gray-600 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Assistant
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-8 px-3.5 rounded-md bg-[#0F1B2A] dark:bg-accent text-white flex items-center gap-1.5 text-[13px] font-medium hover:opacity-90 transition-opacity cursor-pointer"
                >
                  {exporting || saveToVault.state === "saving" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  Export
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
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="More actions"
                  className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors cursor-pointer"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {/* The page carries no toolbar, so formatting lives here --
                    alongside the keyboard shortcuts the editor already has. */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Type className="mr-2 h-3.5 w-3.5" />
                    Formatting
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => editor?.chain().focus().toggleBold().run()}>
                      <Bold className="mr-2 h-3.5 w-3.5" />
                      Bold
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => editor?.chain().focus().toggleItalic().run()}>
                      <Italic className="mr-2 h-3.5 w-3.5" />
                      Italic
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
                      Heading
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => editor?.chain().focus().setParagraph().run()}>
                      Normal text
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => editor?.chain().focus().toggleBulletList().run()}>
                      <List className="mr-2 h-3.5 w-3.5" />
                      Bullet list
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
                      <ListOrdered className="mr-2 h-3.5 w-3.5" />
                      Numbered list
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
                      }
                    >
                      <TableIcon className="mr-2 h-3.5 w-3.5" />
                      Insert table
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => editor?.chain().focus().setTextAlign("left").run()}>
                      <AlignLeft className="mr-2 h-3.5 w-3.5" />
                      Align left
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => editor?.chain().focus().setTextAlign("center").run()}>
                      <AlignCenter className="mr-2 h-3.5 w-3.5" />
                      Align centre
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => editor?.chain().focus().setTextAlign("right").run()}>
                      <AlignRight className="mr-2 h-3.5 w-3.5" />
                      Align right
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Typeface</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {fontFamilies.map((font) => (
                      <DropdownMenuItem
                        key={font}
                        onClick={() => onTypographyChange({ ...typography, fontFamily: font })}
                      >
                        {font}
                        {displayFont(typography.fontFamily) === font && (
                          <span className="ml-auto text-accent">✓</span>
                        )}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    {fontSizes.map((size) => (
                      <DropdownMenuItem
                        key={size}
                        onClick={() => onTypographyChange({ ...typography, fontSizePt: size })}
                      >
                        {size} pt
                        {typography.fontSizePt === size && <span className="ml-auto text-accent">✓</span>}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}>
                  <Undo2 className="mr-2 h-3.5 w-3.5" />
                  Undo
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}>
                  <Redo2 className="mr-2 h-3.5 w-3.5" />
                  Redo
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={copyLink}>
                  <Link2 className="mr-2 h-3.5 w-3.5" />
                  {copied ? "Link copied" : "Copy link"}
                </DropdownMenuItem>
                {hasSourcePdf && templateId && (
                  <DropdownMenuItem onClick={openSourcePdf} disabled={openingSource}>
                    {openingSource ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileText className="mr-2 h-3.5 w-3.5" />
                    )}
                    The court&apos;s original form
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* The document is being rewritten under you -- say so with a line that
          moves, rather than freezing the page. */}
      {streaming && (
        <div className="shrink-0 h-[2px] overflow-hidden bg-blue-100 dark:bg-blue-500/20">
          <div className="redline-progress h-full w-1/3 bg-blue-500 dark:bg-blue-400" />
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div ref={scrollRef} className="relative flex-1 min-w-0 overflow-y-auto custom-scrollbar px-5 sm:px-8 py-6">
          <div
            ref={columnRef}
            className="harvey-doc max-w-[980px]"
            style={{ fontFamily: resolveFont(typography.fontFamily), fontSize: `${typography.fontSizePt}pt` }}
          >
            {(revisionBusy || hasPendingApproval) && !scopedActive && onApproveRevision && onRejectRevision && (
              <RedlineApprovalBar
                generating={revisionBusy}
                instruction={pendingApprovalInstruction}
                onApprove={onApproveRevision}
                onReject={onRejectRevision}
              />
            )}

            {/* An empty redline would blank the page, so the editor stays up
                until there is actually a diff to read. */}
            {showRedline ? (
              <RedlineView html={redlineHtml} className={streaming ? "is-streaming" : "is-settled"} />
            ) : (
              <EditorContent editor={editor} />
            )}
          </div>

          {/* Select a passage and describe the change, in the document itself. */}
          {!showRedline && onAddRevision && (
            <InlineEditComposer
              editor={editor}
              containerRef={scrollRef}
              columnRef={columnRef}
              selection={selection}
              activeScope={scopedActive ? activeScope : null}
              busy={revisionBusy}
              approvalInstruction={pendingApprovalInstruction}
              onSubmit={onAddRevision}
              onApprove={onApproveRevision}
              onReject={onRejectRevision}
            />
          )}
        </div>

        <aside className="w-full lg:w-[400px] xl:w-[420px] shrink-0 overflow-y-auto custom-scrollbar px-5 sm:px-6 py-6 lg:pl-0">
          {rail}
        </aside>
      </div>
    </div>
  )
}
