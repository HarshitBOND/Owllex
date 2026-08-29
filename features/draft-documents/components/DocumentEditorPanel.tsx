"use client"

import { useEffect, useRef, useState } from "react"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import TextAlign from "@tiptap/extension-text-align"
import Link from "@tiptap/extension-link"
import CharacterCount from "@tiptap/extension-character-count"
import {
  Check,
  Undo2,
  Redo2,
  Download,
  Share2,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Link as LinkIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RotateCcw,
  ChevronDown,
  Minus,
  Plus,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface DocumentEditorPanelProps {
  initialContent: string
  onEditorReady: (editor: Editor) => void
}

const paragraphStyles = [
  { label: "Normal Text", value: "paragraph" },
  { label: "Heading 1", value: "h1" },
  { label: "Heading 2", value: "h2" },
  { label: "Heading 3", value: "h3" },
]

const fontFamilies = ["Georgia", "Times New Roman", "Arial", "Inter"]
const fontSizes = ["10", "11", "12", "14", "16", "18"]
const aligns: Array<"left" | "center" | "right"> = ["left", "center", "right"]

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
        active ? "bg-accent/10 text-accent" : "text-gray-600 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  )
}

export default function DocumentEditorPanel({ initialContent, onEditorReady }: DocumentEditorPanelProps) {
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved")
  const [wordCount, setWordCount] = useState(0)
  const [zoom, setZoom] = useState(100)
  const [fontFamily, setFontFamily] = useState("Georgia")
  const [fontSize, setFontSize] = useState("12")
  const [alignIndex, setAlignIndex] = useState(0)
  const [downloadLabel, setDownloadLabel] = useState("Download")
  const [shareLabel, setShareLabel] = useState("Share")
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false }),
      CharacterCount,
    ],
    content: initialContent,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "draft-doc-editor focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      setWordCount(editor.storage.characterCount.words())
      setSaveStatus("saving")
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      saveTimeout.current = setTimeout(() => setSaveStatus("saved"), 800)
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
      p.value === "paragraph" ? editor.isActive("paragraph") : editor.isActive("heading", { level: Number(p.value[1]) }),
    ) ?? paragraphStyles[0]

  const setParagraphStyle = (value: string) => {
    if (value === "paragraph") {
      editor.chain().focus().setParagraph().run()
    } else {
      editor
        .chain()
        .focus()
        .toggleHeading({ level: Number(value[1]) as 1 | 2 | 3 })
        .run()
    }
  }

  const setLink = () => {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const url = window.prompt("Link URL")
    if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }

  const cycleAlign = () => {
    const next = (alignIndex + 1) % aligns.length
    setAlignIndex(next)
    editor.chain().focus().setTextAlign(aligns[next]).run()
  }

  const AlignIcon = alignIndex === 0 ? AlignLeft : alignIndex === 1 ? AlignCenter : AlignRight

  const handleDownload = () => {
    const text = editor.getText({ blockSeparator: "\n\n" })
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "rental-agreement.txt"
    a.click()
    URL.revokeObjectURL(url)
    setDownloadLabel("Downloaded")
    setTimeout(() => setDownloadLabel("Download"), 1500)
  }

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareLabel("Link copied")
    } catch {
      setShareLabel("Share")
    }
    setTimeout(() => setShareLabel("Share"), 1500)
  }

  return (
    <div className="flex-1 min-w-0 h-[70vh] lg:h-full flex flex-col rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-border shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-lg sm:text-xl font-semibold text-gray-900 dark:text-foreground truncate">
              Drafting: Rental Agreement
            </h1>
            <span className="inline-flex items-center shrink-0 rounded-full bg-accent/10 text-accent text-[11px] font-medium px-2 py-0.5">
              Draft
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1 text-[12px] text-emerald-600 dark:text-accent">
            <Check className="w-3.5 h-3.5" />
            {saveStatus === "saving" ? "Saving…" : "All changes saved"}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
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
          <button
            type="button"
            onClick={handleDownload}
            className="h-8 px-3 rounded-lg border border-gray-200 dark:border-border flex items-center gap-1.5 text-[13px] font-medium text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-secondary transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {downloadLabel}
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="h-8 px-3 rounded-lg bg-accent text-white flex items-center gap-1.5 text-[13px] font-medium hover:bg-accent-hover transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            {shareLabel}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 dark:border-border overflow-x-auto shrink-0">
        <ToolbarButton title="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
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
              {fontFamily}
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {fontFamilies.map((font) => (
              <DropdownMenuItem key={font} onClick={() => setFontFamily(font)}>
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
              {fontSize}
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {fontSizes.map((size) => (
              <DropdownMenuItem key={size} onClick={() => setFontSize(size)}>
                {size}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <ToolbarDivider />

        <ToolbarButton title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
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
        <ToolbarButton title="Align" onClick={cycleAlign}>
          <AlignIcon className="w-4 h-4" />
        </ToolbarButton>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-[#F8F9FB] dark:bg-background/40 px-4 py-8">
        <div
          className="mx-auto max-w-[760px] origin-top bg-white dark:bg-card shadow-sm border border-gray-200 dark:border-border"
          style={{ zoom: `${zoom}%` }}
        >
          <EditorContent editor={editor} style={{ fontFamily, fontSize: `${fontSize}px` }} className="px-12 py-14" />
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-2 border-t border-gray-200 dark:border-border text-[12px] text-muted-foreground shrink-0">
        <div className="flex items-center gap-3">
          <span>{wordCount.toLocaleString()} words</span>
          <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-border" />
          <span>English (India)</span>
          <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-border" />
          <span className="flex items-center gap-1 text-emerald-600 dark:text-accent">
            <Check className="w-3 h-3" />
            {saveStatus === "saving" ? "Saving…" : "Saved just now"}
          </span>
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
