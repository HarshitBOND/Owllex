"use client"

import { useEffect, useRef, useState } from "react"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
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
  ExternalLink,
  FileText,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Sparkles,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
  Upload,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { SaveStatus } from "@/features/draft-documents/hooks/useDraftAutosave"
import { IssueHighlight, issueHighlightKey } from "./issueHighlightExtension"
import { fontFamilies, fontSizes, type ContractFileMeta, type ContractIssue } from "../data"

interface ContractDocumentPanelProps {
  fileMeta: ContractFileMeta
  reviewId: string | null
  contentHtml: string
  typography: { fontFamily: string; fontSizePt: number }
  onTypographyChange: (typography: { fontFamily: string; fontSizePt: number }) => void
  onContentChange: (html: string, words: number) => void
  onEditorReady: (editor: Editor) => void
  saveStatus: SaveStatus
  onRetrySave: () => void
  issues: ContractIssue[]
  selectedIssueId: string | null
  onSelectIssue: (id: string) => void
  resolvedIssueIds: Set<string>
  onReupload: () => void
  onRerun: () => void
  isReanalyzing: boolean
}

const paragraphStyles = [
  { label: "Normal Text", value: "paragraph" },
  { label: "Heading 1", value: "h1" },
  { label: "Heading 2", value: "h2" },
  { label: "Heading 3", value: "h3" },
]

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

export default function ContractDocumentPanel({
  fileMeta,
  reviewId,
  contentHtml,
  typography,
  onTypographyChange,
  onContentChange,
  onEditorReady,
  saveStatus,
  onRetrySave,
  issues,
  selectedIssueId,
  onSelectIssue,
  resolvedIssueIds,
  onReupload,
  onRerun,
  isReanalyzing,
}: ContractDocumentPanelProps) {
  const [wordCount, setWordCount] = useState(0)
  const [zoom, setZoom] = useState(100)
  const [viewingOriginal, setViewingOriginal] = useState(false)

  const issuesRef = useRef(issues)
  const selectedRef = useRef(selectedIssueId)
  const resolvedRef = useRef(resolvedIssueIds)
  const onSelectRef = useRef(onSelectIssue)
  useEffect(() => {
    issuesRef.current = issues
  }, [issues])
  useEffect(() => {
    selectedRef.current = selectedIssueId
  }, [selectedIssueId])
  useEffect(() => {
    resolvedRef.current = resolvedIssueIds
  }, [resolvedIssueIds])
  useEffect(() => {
    onSelectRef.current = onSelectIssue
  }, [onSelectIssue])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TableKit.configure({ table: { resizable: false } }),
      CharacterCount,
      IssueHighlight.configure({
        getMeta: () => ({
          issues: issuesRef.current,
          selectedId: selectedRef.current,
          resolvedIds: resolvedRef.current,
        }),
        onSelect: (id) => onSelectRef.current(id),
      }),
    ],
    content: contentHtml,
    immediatelyRender: false,
    editorProps: { attributes: { class: "draft-doc-editor focus:outline-none" } },
    onUpdate: ({ editor }) => {
      const words = editor.storage.characterCount.words()
      setWordCount(words)
      onContentChange(editor.getHTML(), words)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!editor) return
    setWordCount(editor.storage.characterCount.words())
    onEditorReady(editor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const tr = editor.state.tr.setMeta(issueHighlightKey, {
      issues,
      selectedId: selectedIssueId,
      resolvedIds: resolvedIssueIds,
    })
    editor.view.dispatch(tr)
  }, [editor, issues, selectedIssueId, resolvedIssueIds])

  if (!editor) {
    return (
      <div className="flex-1 min-w-0 h-[75vh] xl:h-[calc(100vh-190px)] flex items-center justify-center rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card">
        <div className="w-8 h-8 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
      </div>
    )
  }

  const currentParagraphStyle =
    paragraphStyles.find((p) =>
      p.value === "paragraph"
        ? editor.isActive("paragraph")
        : editor.isActive("heading", { level: Number(p.value[1]) }),
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

  const currentFont = fontFamilies.find((f) => f.value === typography.fontFamily) ?? fontFamilies[0]

  const viewOriginal = async () => {
    if (!reviewId || viewingOriginal) return
    setViewingOriginal(true)
    try {
      const res = await fetch(`/api/contract-review/${reviewId}/file-url`)
      const data = await res.json()
      if (data.success) window.open(data.url, "_blank", "noopener,noreferrer")
    } finally {
      setViewingOriginal(false)
    }
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
        Not saving — opened elsewhere
      </span>
    ) : (
      <span className="flex items-center gap-1 text-emerald-600 dark:text-accent">
        <Check className="w-3.5 h-3.5" />
        All changes saved
      </span>
    )

  return (
    <div className="flex-1 min-w-0 h-[75vh] xl:h-[calc(100vh-190px)] flex flex-col rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-border shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-500/10 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-red-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-foreground truncate">{fileMeta.name}</p>
            <p className="text-[12px]">{statusLine}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {reviewId && (
            <button
              type="button"
              onClick={viewOriginal}
              disabled={viewingOriginal}
              className="h-8 px-3 rounded-lg border border-gray-200 dark:border-border flex items-center gap-1.5 text-[12.5px] font-medium text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-secondary transition-colors disabled:opacity-50"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View original
            </button>
          )}
          <button
            type="button"
            onClick={onReupload}
            className="h-8 px-3 rounded-lg border border-gray-200 dark:border-border flex items-center gap-1.5 text-[12.5px] font-medium text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-secondary transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Re-upload
          </button>
          <button
            type="button"
            onClick={onRerun}
            disabled={isReanalyzing}
            className="h-8 px-3 rounded-lg bg-gray-900 dark:bg-accent text-white flex items-center gap-1.5 text-[12.5px] font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isReanalyzing ? "animate-spin" : ""}`} />
            {isReanalyzing ? "Reviewing…" : "Re-run review"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 dark:border-border overflow-x-auto shrink-0">
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
              {currentFont.label}
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {fontFamilies.map((font) => (
              <DropdownMenuItem
                key={font.value}
                onClick={() => onTypographyChange({ ...typography, fontFamily: font.value })}
              >
                {font.label}
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

        <ToolbarButton
          title="Link"
          active={editor.isActive("link")}
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run()
              return
            }
            const url = window.prompt("Link URL")
            if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
          }}
        >
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

        <ToolbarDivider />

        <ToolbarButton title="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="w-4 h-4" />
        </ToolbarButton>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-[#F8F9FB] dark:bg-background/40 px-4 py-8">
        <div
          className="mx-auto max-w-[760px] origin-top bg-white dark:bg-card shadow-sm border border-gray-200 dark:border-border"
          style={{ zoom: `${zoom}%` }}
        >
          <EditorContent
            editor={editor}
            style={{ fontFamily: typography.fontFamily, fontSize: `${typography.fontSizePt}pt` }}
            className="px-12 py-14"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-2 border-t border-gray-200 dark:border-border text-[12px] text-muted-foreground shrink-0">
        <div className="flex items-center gap-3">
          <span>{wordCount.toLocaleString()} words</span>
          <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-border" />
          {isReanalyzing ? (
            <span className="flex items-center gap-1 text-accent">
              <Sparkles className="w-3.5 h-3.5" />
              Reviewing…
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              AI review may not be 100% accurate. Please review important clauses.
            </span>
          )}
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
