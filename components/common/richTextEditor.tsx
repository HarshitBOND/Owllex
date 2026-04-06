"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import CharacterCount from "@tiptap/extension-character-count";
import { common, createLowlight } from "lowlight";
import { 
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, 
  Heading1, Heading2, Heading3, Undo, Redo, AlignLeft, AlignCenter, 
  AlignRight, AlignJustify, Highlighter, Link as LinkIcon, Image as ImageIcon,
  Code, Quote, Minus, Table as TableIcon, CheckSquare, Subscript as SubIcon,
  Superscript as SuperIcon, Strikethrough, Type, Palette,
  ChevronDown,
  Check,
  Users,
  HatGlasses,
  SaveIcon,
  FilePlus2,
  Loader2
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "../ui/button";

const lowlight = createLowlight(common);

type Visibility = "public" | "private";

export default function RichTextEditor({id, setTrigger, source}: {id: string, setTrigger: React.Dispatch<React.SetStateAction<number>>, source: string}) {
  const [isMounted, setIsMounted] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [savingContent, setSavingContent] = useState(false);
  const [charCount, setCharCount] = useState<number>(0);

  useEffect(() => setIsMounted(true), []);

  const editor = useEditor({
    extensions: [
        StarterKit.configure({
            codeBlock: false,
        }),
            CharacterCount.configure({
            limit: 10000,
            }),
        Underline,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        Highlight.configure({ multicolor: true }),
        TextStyle,
        Color,
        Link.configure({
            openOnClick: false,
            HTMLAttributes: {
            class: "text-primary underline cursor-pointer dark:text-cyan-400",
            },
        }),
        Image,
        Table.configure({
            resizable: true,
        }),
        TableRow,
        TableHeader,
        TableCell,
        TaskList,
        TaskItem.configure({
            nested: true,
        }),
        Subscript,
        Superscript,
        CodeBlockLowlight.configure({
            lowlight,
        }),
    ],
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none p-4",
      },
    },
  });

  useEffect(() => {
    if (editor && showLinkInput) {
      const { href } = editor.getAttributes("link");
      setLinkUrl(href || "");
    }
  }, [showLinkInput, editor]);

  useEffect(() => {
    if (!editor || !editor.storage.characterCount) return;

    const update = () => {
      setCharCount(editor.storage.characterCount.characters() || 0);
    };

    editor.on("update", update);
    update(); // initialize

    return () => {
        if (!editor) return;
        editor.off("update", update);
    }
  }, [editor]);

  if (!isMounted || !editor) return null;

    const setLink = () => {
        if (linkUrl === "") {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
        } else {
        editor.chain().focus().extendMarkRange("link").setLink({ href: linkUrl }).run();
        }
        setShowLinkInput(false);
        setLinkUrl("");
    };

    const addImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = async (e) => {
        const target = e.target as HTMLInputElement;         
        const file = target.files?.[0];                     
        if (!file) return;
        
        const loadingToast = document.createElement('div');
        loadingToast.textContent = 'Uploading image...';
        loadingToast.className = 'fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded shadow-lg';
        document.body.appendChild(loadingToast);
        
        try {
        const formData = new FormData();
        formData.append('image', file);
        
        const response = await fetch('/api/upload/image', {
            method: 'POST',
            body: formData,
        });
        
        if (!response.ok) {
            throw new Error('Upload failed');
        }
        
        const data = await response.json();
        
        const imageUrl = data.url;
        
        // Insert image into editor
        editor.chain().focus().setImage({ src: imageUrl }).run();
        
        // Remove loading toast
        document.body.removeChild(loadingToast);
        
        } catch (error) {
        console.error('Error uploading image:', error);
        
        // Remove loading toast
        document.body.removeChild(loadingToast);
        
        // Show error message using DOM toast
        const errorToast = document.createElement('div');
        errorToast.textContent = 'Failed to upload image. Please try again.';
        errorToast.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg z-50';
        document.body.appendChild(errorToast);
        setTimeout(() => document.body.removeChild(errorToast), 3000);
        }
    };
    
    // Trigger file selection
    input.click();
    };

    const saveContent = async () => {
    try {
        setSavingContent(true)
        const htmlContent = editor.getHTML();

        if (htmlContent === "<p></p>") {
            setSavingContent(false)
            return
        }
        
        const jsonContent = editor.getJSON();
        
        const loadingMsg = document.createElement('div');
        loadingMsg.textContent = 'Saving...';
        loadingMsg.className = 'fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded shadow-lg z-50';
        document.body.appendChild(loadingMsg);
        
        const response = await fetch(`/api/userdetails/${source}s/add-notes`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            clientId: id,
            visibility,
            content: htmlContent,      
            contentJson: jsonContent,  
            title: 'My Document',      
        }),
        });
        
        const data = await response.json()
        if (!data.success) {
        throw new Error('Failed to save content');
        }
        
        
        loadingMsg.textContent = 'Saved successfully!';
        loadingMsg.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50';
        setTimeout(() => document.body.removeChild(loadingMsg), 2000);
        editor?.chain().focus().setContent('').run();
        
    } catch (error) {
        console.error('Save error:', error);
        const errToast = document.createElement('div');
        errToast.textContent = 'Failed to save content';
        errToast.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg z-50';
        document.body.appendChild(errToast);
        setTimeout(() => document.body.removeChild(errToast), 3000);
    }
    setSavingContent(false)
    setTrigger((prev) => prev + 1)
    };

    const colors = ["#000000", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF", "#FFA500", "#800080", "#008000"];
    const highlightColors = ["#FFFF00", "#00FF00", "#00FFFF", "#FF00FF", "#FFA500", "#FFB6C1"];
        const swatchColorClasses: Record<string, string> = {
            '#000000': 'bg-[#000000]',
            '#FF0000': 'bg-[#FF0000]',
            '#00FF00': 'bg-[#00FF00]',
            '#0000FF': 'bg-[#0000FF]',
            '#FFFF00': 'bg-[#FFFF00]',
            '#FF00FF': 'bg-[#FF00FF]',
            '#00FFFF': 'bg-[#00FFFF]',
            '#FFA500': 'bg-[#FFA500]',
            '#800080': 'bg-[#800080]',
            '#008000': 'bg-[#008000]',
            '#FFB6C1': 'bg-[#FFB6C1]',
        };

    const ToolbarButton = ({ onClick, isActive, children, title }: { onClick: () => void, isActive: boolean, children: React.ReactNode, title: string }) => (
        <button
        onClick={onClick}
        title={title}
        className={`p-2 rounded hover:bg-gray-100 transition-colors ${
            isActive ? "bg-blue-100 text-blue-600" : "text-gray-700"
        }`}
        >
        {children}
        </button>
    );

    const Divider = () => <div className="w-px h-6 bg-gray-300 mx-1" />;

    return (
        <div className="w-full">
        <div className="border rounded-lg shadow-lg bg-white">
            {/* Toolbar */}
            <div className="border-b bg-gray-50 p-2 sticky top-0 z-10">
                <div className="flex items-center gap-x-4">
                    <h2 className="text-lg font-semibold ps-2">Rich Text Editor</h2>
                    <div className="flex items-center gap-x-2">
                        <p>Set Visibility</p>
                        <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="w-fit">
                            {visibility === "public" ? <Users /> : <HatGlasses />} {visibility === "public" ? "Public" : "Private"} <ChevronDown className="ml-2" />
                            </Button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="start">
                            <DropdownMenuItem
                            onClick={() => setVisibility("public")}
                            className="flex items-center justify-between"
                            >
                            <span>Public</span>
                            {visibility === "public" ? <Check className="w-4 h-4" /> : null}
                            </DropdownMenuItem>

                            <DropdownMenuItem
                            onClick={() => setVisibility("private")}
                            className="flex items-center justify-between"
                            >
                            <span>Private</span>
                            {visibility === "private" ? <Check className="w-4 h-4" /> : null}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
                <hr className="my-2" />
                <div className="flex flex-wrap gap-1 items-center">
                    {/* Text Formatting */}
                    <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    isActive={editor.isActive("bold")}
                    title="Bold (Ctrl+B)"
                    >
                    <Bold size={18} />
                    </ToolbarButton>
                    <ToolbarButton
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    isActive={editor.isActive("italic")}
                    title="Italic (Ctrl+I)"
                    >
                    <Italic size={18} />
                    </ToolbarButton>
                    <ToolbarButton
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    isActive={editor.isActive("underline")}
                    title="Underline (Ctrl+U)"
                    >
                    <UnderlineIcon size={18} />
                    </ToolbarButton>
                    <ToolbarButton
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    isActive={editor.isActive("strike")}
                    title="Strikethrough"
                    >
                    <Strikethrough size={18} />
                    </ToolbarButton>

                    <Divider />

                    {/* Headings */}
                    <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    isActive={editor.isActive("heading", { level: 1 })}
                    title="Heading 1"
                    >
                    <Heading1 size={18} />
                    </ToolbarButton>
                    <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    isActive={editor.isActive("heading", { level: 2 })}
                    title="Heading 2"
                    >
                    <Heading2 size={18} />
                    </ToolbarButton>
                    <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                    isActive={editor.isActive("heading", { level: 3 })}
                    title="Heading 3"
                    >
                    <Heading3 size={18} />
                    </ToolbarButton>
                    <ToolbarButton
                    onClick={() => editor.chain().focus().setParagraph().run()}
                    isActive={editor.isActive("paragraph")}
                    title="Paragraph"
                    >
                    <Type size={18} />
                    </ToolbarButton>

                    <Divider />

                    {/* Text Color */}
                    <div className="relative">
                    <ToolbarButton
                        isActive={editor.isActive("textStyle", { color: colors })}
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        title="Text Color"
                    >
                        <Palette size={18} />
                    </ToolbarButton>
                    {showColorPicker && (
                        <div className="absolute top-full left-0 mt-1 p-2 bg-white border rounded shadow-lg z-20 flex gap-1">
                        {colors.map((color) => (
                            <button
                            key={color}
                            onClick={() => {
                                editor.chain().focus().setColor(color).run();
                                setShowColorPicker(false);
                            }}
                            className={`w-6 h-6 rounded border-2 border-gray-300 hover:border-gray-500 ${swatchColorClasses[color] ?? 'bg-gray-200'}`}
                            />
                        ))}
                        </div>
                    )}
                    </div>

                    {/* Highlight */}
                    <div className="relative">
                    <ToolbarButton
                        onClick={() => setShowHighlightPicker(!showHighlightPicker)}
                        isActive={editor.isActive("highlight")}
                        title="Highlight"
                    >
                        <Highlighter size={18} />
                    </ToolbarButton>
                    {showHighlightPicker && (
                        <div className="absolute top-full left-0 mt-1 p-2 bg-white border rounded shadow-lg z-20 flex gap-1">
                        {highlightColors.map((color) => (
                            <button
                            key={color}
                            onClick={() => {
                                editor.chain().focus().toggleHighlight({ color }).run();
                                setShowHighlightPicker(false);
                            }}
                            className={`w-6 h-6 rounded border-2 border-gray-300 hover:border-gray-500 ${swatchColorClasses[color] ?? 'bg-gray-200'}`}
                            />
                        ))}
                        <button
                            onClick={() => {
                            editor.chain().focus().unsetHighlight().run();
                            setShowHighlightPicker(false);
                            }}
                            className="w-6 h-6 rounded border-2 border-gray-300 hover:border-gray-500 bg-white flex items-center justify-center text-xs"
                        >
                            ✕
                        </button>
                        </div>
                    )}
                    </div>

                    <Divider />

                    {/* Alignment */}
                    <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign("left").run()}
                    isActive={editor.isActive({ textAlign: "left" })}
                    title="Align Left"
                    >
                    <AlignLeft size={18} />
                    </ToolbarButton>
                    <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign("center").run()}
                    isActive={editor.isActive({ textAlign: "center" })}
                    title="Align Center"
                    >
                    <AlignCenter size={18} />
                    </ToolbarButton>
                    <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign("right").run()}
                    isActive={editor.isActive({ textAlign: "right" })}
                    title="Align Right"
                    >
                    <AlignRight size={18} />
                    </ToolbarButton>
                    <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign("justify").run()}
                    isActive={editor.isActive({ textAlign: "justify" })}
                    title="Justify"
                    >
                    <AlignJustify size={18} />
                    </ToolbarButton>

                    <Divider />

                    {/* Lists */}
                    <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    isActive={editor.isActive("bulletList")}
                    title="Bullet List"
                    >
                    <List size={18} />
                    </ToolbarButton>
                    <ToolbarButton
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    isActive={editor.isActive("orderedList")}
                    title="Numbered List"
                    >
                    <ListOrdered size={18} />
                    </ToolbarButton>
                    <ToolbarButton
                    onClick={() => editor.chain().focus().toggleTaskList().run()}
                    isActive={editor.isActive("taskList")}
                    title="Task List"
                    >
                    <CheckSquare size={18} />
                    </ToolbarButton>

                    <Divider />

                    {/* Special */}
                    <ToolbarButton
                    onClick={() => setShowLinkInput(!showLinkInput)}
                    isActive={editor.isActive("link")}
                    title="Insert Link"
                    >
                    <LinkIcon size={18} />
                    </ToolbarButton>
                    <ToolbarButton
                    onClick={addImage}
                    isActive={editor.isActive("image")}
                    title="Insert Image"
                    >
                    <ImageIcon size={18} />
                    </ToolbarButton>
                    <ToolbarButton
                    onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                    isActive={editor.isActive("codeBlock")}
                    title="Code Block"
                    >
                    <Code size={18} />
                    </ToolbarButton>
                    <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    isActive={editor.isActive("blockquote")}
                    title="Quote"
                    >
                    <Quote size={18} />
                    </ToolbarButton>
                    <ToolbarButton
                    isActive={editor.isActive("horizontalRule")}
                    onClick={() => editor.chain().focus().setHorizontalRule().run()}
                    title="Horizontal Rule"
                    >
                    <Minus size={18} />
                    </ToolbarButton>

                    <Divider />

                    {/* Table */}
                    <ToolbarButton
                    isActive={editor.isActive("table")}
                    onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                    title="Insert Table"
                    >
                    <TableIcon size={18} />
                    </ToolbarButton>

                    <Divider />

                    {/* Scripts */}
                    <ToolbarButton
                    onClick={() => editor.chain().focus().toggleSubscript().run()}
                    isActive={editor.isActive("subscript")}
                    title="Subscript"
                    >
                    <SubIcon size={18} />
                    </ToolbarButton>
                    <ToolbarButton
                    onClick={() => editor.chain().focus().toggleSuperscript().run()}
                    isActive={editor.isActive("superscript")}
                    title="Superscript"
                    >
                    <SuperIcon size={18} />
                    </ToolbarButton>

                    <Divider />

                    {/* Undo/Redo */}
                    <ToolbarButton
                    isActive={editor.isActive("undo")}
                    onClick={() => editor.chain().focus().undo().run()}
                    title="Undo (Ctrl+Z)"
                    >
                    <Undo size={18} />
                    </ToolbarButton>
                    <ToolbarButton
                    isActive={editor.isActive("redo")}
                    onClick={() => editor.chain().focus().redo().run()}
                    title="Redo (Ctrl+Y)"
                    >
                    <Redo size={18} />
                    </ToolbarButton>
                </div>

            {/* Link Input */}
            {showLinkInput && (
                <div className="mt-2 flex gap-2 items-center p-2 bg-white border rounded">
                <input
                    type="url"
                    placeholder="https://example.com"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && setLink()}
                    className="flex-1 px-3 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                    onClick={setLink}
                    className="px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                    Set Link
                </button>
                <button
                    onClick={() => {
                    editor.chain().focus().unsetLink().run();
                    setShowLinkInput(false);
                    }}
                    className="px-4 py-1 bg-gray-200 rounded hover:bg-gray-300"
                >
                    Remove
                </button>
                </div>
            )}
            </div>

            {/* Editor Content with Max Height and Scroll */}
            <div className="overflow-y-auto max-h-[500px]">
            <EditorContent editor={editor} />
            </div>

            {/* Footer Info */}
            <div className="border-t bg-gray-50 px-4 py-2 text-xs text-gray-600">
            {charCount || 0} characters
            </div>
        </div>
        <div className="mt-4 flex gap-x-2 ms-auto w-fit">
            <Button onClick={() => {}} variant="outline" disabled={savingContent}>
                <FilePlus2 />
                Add Reference Document
            </Button>
            <Button onClick={saveContent} variant="outline" disabled={savingContent}>
                {savingContent ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SaveIcon />}
                {savingContent ? "Saving..." : "Save Note"}
            </Button>
        </div>
        </div>
    );
}