"use client"

import { useEffect } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import TextAlign from "@tiptap/extension-text-align"
import CharacterCount from "@tiptap/extension-character-count"
import { TableKit } from "@tiptap/extension-table"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react"

export const templateEditorExtensions = [
  StarterKit.configure({ link: { openOnClick: false } }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  TableKit.configure({ table: { resizable: false } }),
  CharacterCount,
]

function Btn({
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

export default function TemplateBodyEditor({
  initialContent,
  onChange,
}: {
  initialContent: string
  onChange: (html: string, textLength: number) => void
}) {
  const editor = useEditor({
    extensions: templateEditorExtensions,
    content: initialContent,
    immediatelyRender: false,
    editorProps: { attributes: { class: "draft-doc-editor focus:outline-none" } },
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.getText().trim().length),
  })

  useEffect(() => {
    if (editor) onChange(editor.getHTML(), editor.getText().trim().length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  if (!editor) {
    return (
      <div className="h-[320px] flex items-center justify-center rounded-lg border-2 border-gray-200 dark:border-gray-700">
        <div className="w-6 h-6 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
      </div>
    )
  }

  const blockValue = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
      ? "h2"
      : editor.isActive("heading", { level: 3 })
        ? "h3"
        : "paragraph"

  return (
    <div className="rounded-lg border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center gap-1 flex-wrap px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <select
          value={blockValue}
          onChange={(e) => {
            const v = e.target.value
            if (v === "paragraph") editor.chain().focus().setParagraph().run()
            else editor.chain().focus().toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run()
          }}
          className="h-7 px-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs"
        >
          <option value="paragraph">Normal text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

        <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
          <Bold size={14} />
        </Btn>
        <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
          <Italic size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Underline"
        >
          <UnderlineIcon size={14} />
        </Btn>

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

        <Btn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bulleted list"
        >
          <List size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Numbered list"
        >
          <ListOrdered size={14} />
        </Btn>

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

        <Btn
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          title="Align left"
        >
          <AlignLeft size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          title="Align centre"
        >
          <AlignCenter size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          title="Align right"
        >
          <AlignRight size={14} />
        </Btn>

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

        <Btn
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
          title="Insert table"
        >
          <TableIcon size={14} />
        </Btn>

        <div className="ml-auto flex items-center gap-1">
          <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">
            <Undo2 size={14} />
          </Btn>
          <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">
            <Redo2 size={14} />
          </Btn>
          <span className="text-[11px] text-gray-500 dark:text-gray-400 pl-2 pr-1">
            {editor.storage.characterCount.words()} words
          </span>
        </div>
      </div>

      <div className="h-[320px] overflow-y-auto bg-white dark:bg-gray-900 px-6 py-4">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
