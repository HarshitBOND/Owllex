import { useState, useRef } from 'react';
import { 
  Bold, 
  Italic, 
  Underline, 
  List, 
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Type,
  ChevronDown,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Quote,
  Highlighter,
  Paintbrush,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormattingToolbarProps {
  contentRef: React.RefObject<HTMLDivElement>;
  onContentChange: () => void;
  isMobile?: boolean;
}

const FONTS = [
  { name: 'Inter', value: 'Inter, system-ui, sans-serif' },
  { name: 'Georgia', value: 'Georgia, serif' },
  { name: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { name: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { name: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { name: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { name: 'Courier New', value: '"Courier New", Courier, monospace' },
  { name: 'Lucida Console', value: '"Lucida Console", Monaco, monospace' },
  { name: 'Comic Sans MS', value: '"Comic Sans MS", cursive' },
  { name: 'Impact', value: 'Impact, Charcoal, sans-serif' },
  { name: 'Palatino', value: '"Palatino Linotype", Palatino, serif' },
  { name: 'Garamond', value: 'Garamond, serif' },
  { name: 'Bookman', value: '"Bookman Old Style", serif' },
  { name: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { name: 'Century Gothic', value: '"Century Gothic", sans-serif' },
];

const TEXT_COLORS = [
  // Grays
  { name: 'Black', value: '#000000' },
  { name: 'Dark Gray', value: '#374151' },
  { name: 'Gray', value: '#6b7280' },
  { name: 'Light Gray', value: '#9ca3af' },
  // Reds
  { name: 'Dark Red', value: '#991b1b' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Light Red', value: '#ef4444' },
  { name: 'Rose', value: '#f43f5e' },
  // Oranges
  { name: 'Dark Orange', value: '#c2410c' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Light Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  // Yellows
  { name: 'Dark Yellow', value: '#ca8a04' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Light Yellow', value: '#facc15' },
  { name: 'Lime', value: '#84cc16' },
  // Greens
  { name: 'Dark Green', value: '#166534' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Light Green', value: '#22c55e' },
  { name: 'Emerald', value: '#10b981' },
  // Teals
  { name: 'Dark Teal', value: '#0f766e' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Sky', value: '#0ea5e9' },
  // Blues
  { name: 'Dark Blue', value: '#1e40af' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Light Blue', value: '#3b82f6' },
  { name: 'Indigo', value: '#6366f1' },
  // Purples
  { name: 'Dark Purple', value: '#6b21a8' },
  { name: 'Purple', value: '#9333ea' },
  { name: 'Violet', value: '#a855f7' },
  { name: 'Fuchsia', value: '#d946ef' },
  // Pinks
  { name: 'Dark Pink', value: '#be185d' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Light Pink', value: '#f472b6' },
  { name: 'Rose Pink', value: '#fb7185' },
];

const HIGHLIGHT_COLORS = [
  { name: 'None', value: 'transparent' },
  { name: 'Yellow', value: '#fef08a' },
  { name: 'Lime', value: '#d9f99d' },
  { name: 'Green', value: '#bbf7d0' },
  { name: 'Cyan', value: '#a5f3fc' },
  { name: 'Blue', value: '#bfdbfe' },
  { name: 'Purple', value: '#ddd6fe' },
  { name: 'Pink', value: '#fbcfe8' },
  { name: 'Rose', value: '#fecdd3' },
  { name: 'Orange', value: '#fed7aa' },
  { name: 'Amber', value: '#fde68a' },
  { name: 'Red', value: '#fecaca' },
];

const TEXT_COLOR_SWATCH_CLASSES: Record<string, string> = {
  '#000000': 'bg-[#000000]',
  '#374151': 'bg-[#374151]',
  '#6b7280': 'bg-[#6b7280]',
  '#9ca3af': 'bg-[#9ca3af]',
  '#991b1b': 'bg-[#991b1b]',
  '#dc2626': 'bg-[#dc2626]',
  '#ef4444': 'bg-[#ef4444]',
  '#f43f5e': 'bg-[#f43f5e]',
  '#c2410c': 'bg-[#c2410c]',
  '#ea580c': 'bg-[#ea580c]',
  '#f97316': 'bg-[#f97316]',
  '#f59e0b': 'bg-[#f59e0b]',
  '#ca8a04': 'bg-[#ca8a04]',
  '#eab308': 'bg-[#eab308]',
  '#facc15': 'bg-[#facc15]',
  '#84cc16': 'bg-[#84cc16]',
  '#166534': 'bg-[#166534]',
  '#16a34a': 'bg-[#16a34a]',
  '#22c55e': 'bg-[#22c55e]',
  '#10b981': 'bg-[#10b981]',
  '#0f766e': 'bg-[#0f766e]',
  '#14b8a6': 'bg-[#14b8a6]',
  '#06b6d4': 'bg-[#06b6d4]',
  '#0ea5e9': 'bg-[#0ea5e9]',
  '#1e40af': 'bg-[#1e40af]',
  '#2563eb': 'bg-[#2563eb]',
  '#3b82f6': 'bg-[#3b82f6]',
  '#6366f1': 'bg-[#6366f1]',
  '#6b21a8': 'bg-[#6b21a8]',
  '#9333ea': 'bg-[#9333ea]',
  '#a855f7': 'bg-[#a855f7]',
  '#d946ef': 'bg-[#d946ef]',
  '#be185d': 'bg-[#be185d]',
  '#ec4899': 'bg-[#ec4899]',
  '#f472b6': 'bg-[#f472b6]',
  '#fb7185': 'bg-[#fb7185]',
};

const HIGHLIGHT_SWATCH_CLASSES: Record<string, string> = {
  transparent: 'bg-card',
  '#fef08a': 'bg-[#fef08a]',
  '#d9f99d': 'bg-[#d9f99d]',
  '#bbf7d0': 'bg-[#bbf7d0]',
  '#a5f3fc': 'bg-[#a5f3fc]',
  '#bfdbfe': 'bg-[#bfdbfe]',
  '#ddd6fe': 'bg-[#ddd6fe]',
  '#fbcfe8': 'bg-[#fbcfe8]',
  '#fecdd3': 'bg-[#fecdd3]',
  '#fed7aa': 'bg-[#fed7aa]',
  '#fde68a': 'bg-[#fde68a]',
  '#fecaca': 'bg-[#fecaca]',
};

export const FormattingToolbar = ({ contentRef, onContentChange, isMobile = false }: FormattingToolbarProps) => {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [selectedFont, setSelectedFont] = useState(FONTS[0]);
  const selectionRef = useRef<Range | null>(null);

  const saveSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      selectionRef.current = selection.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    if (selectionRef.current) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(selectionRef.current);
      }
    }
  };

  const closeAllDropdowns = () => {
    setOpenDropdown(null);
  };

  const toggleDropdown = (name: string) => {
    saveSelection();
    setOpenDropdown(openDropdown === name ? null : name);
  };

  const applyStyle = (style: string, value?: string) => {
    restoreSelection();
    contentRef.current?.focus();
    
    requestAnimationFrame(() => {
      document.execCommand(style, false, value);
      onContentChange();
    });
    
    closeAllDropdowns();
  };

  const handleFontChange = (font: typeof FONTS[0]) => {
    setSelectedFont(font);
    applyStyle('fontName', font.value);
  };

  const handleColorChange = (color: string) => {
    applyStyle('foreColor', color);
  };

  const handleHighlightChange = (color: string) => {
    applyStyle('hiliteColor', color);
  };

  const handleHeading = (level: string) => {
    applyStyle('formatBlock', level);
  };

  const ToolButton = ({ 
    onClick, 
    children, 
    title,
    className,
    onMouseDown,
  }: { 
    onClick: () => void; 
    children: React.ReactNode;
    title?: string;
    className?: string;
    onMouseDown?: (e: React.MouseEvent) => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => {
        e.preventDefault();
        saveSelection();
        onMouseDown?.(e);
      }}
      title={title}
      className={cn(
        "p-2 rounded-lg hover:bg-muted transition-all duration-200 text-muted-foreground hover:text-foreground active:scale-95",
        isMobile && "p-2.5",
        className
      )}
    >
      {children}
    </button>
  );

  const DropdownButton = ({ 
    name,
    children,
    title,
  }: { 
    name: string;
    children: React.ReactNode;
    title?: string;
  }) => (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        saveSelection();
      }}
      onClick={() => toggleDropdown(name)}
      title={title}
      className={cn(
        "flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground",
        isMobile && "px-2.5 py-2",
        openDropdown === name && "bg-muted text-foreground"
      )}
    >
      {children}
      <ChevronDown className={cn("h-3 w-3 transition-transform", openDropdown === name && "rotate-180")} />
    </button>
  );

  const Divider = () => (
    <div className={cn("w-px bg-border/60", isMobile ? "h-6 mx-1" : "h-5 mx-1")} />
  );

  const iconSize = isMobile ? "h-5 w-5" : "h-4 w-4";

  return (
    <div className="relative">
      <div className={cn(
        "flex items-center overflow-x-auto scrollbar-thin",
        isMobile ? "gap-0.5 px-2 pb-2" : "gap-0.5 px-3 pb-3"
      )}>
        {/* Font Picker */}
        <div className="relative">
          <DropdownButton name="font" title="Font family">
            <Type className={iconSize} />
            <span className="max-w-16 truncate text-xs hidden sm:inline">{selectedFont.name}</span>
          </DropdownButton>
          
          {openDropdown === 'font' && (
            <div className="absolute left-0 top-full mt-1 w-48 max-h-64 overflow-y-auto bg-card rounded-xl border border-border shadow-xl p-1.5 z-50 animate-scale-in">
              {FONTS.map(font => (
                <button
                  key={font.name}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleFontChange(font)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                    selectedFont.name === font.name ? "bg-muted font-medium" : "hover:bg-muted/50"
                  )}
                >
                  {font.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <Divider />

        {/* Headings Dropdown */}
        <div className="relative">
          <DropdownButton name="heading" title="Headings">
            <Heading1 className={iconSize} />
          </DropdownButton>
          
          {openDropdown === 'heading' && (
            <div className="absolute left-0 top-full mt-1 w-40 bg-card rounded-xl border border-border shadow-xl p-1.5 z-50 animate-scale-in">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleHeading('h1')}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors flex items-center gap-2"
              >
                <Heading1 className="h-5 w-5" />
                <span className="text-lg font-bold">Heading 1</span>
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleHeading('h2')}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors flex items-center gap-2"
              >
                <Heading2 className="h-5 w-5" />
                <span className="text-base font-bold">Heading 2</span>
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleHeading('h3')}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors flex items-center gap-2"
              >
                <Heading3 className="h-5 w-5" />
                <span className="text-sm font-bold">Heading 3</span>
              </button>
              <div className="my-1 mx-2 border-t border-border" />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleHeading('p')}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors flex items-center gap-2"
              >
                <Type className="h-4 w-4" />
                <span className="text-sm">Normal text</span>
              </button>
            </div>
          )}
        </div>

        <Divider />

        {/* Text Formatting */}
        <ToolButton onClick={() => applyStyle('bold')} title="Bold (Ctrl+B)">
          <Bold className={iconSize} />
        </ToolButton>
        <ToolButton onClick={() => applyStyle('italic')} title="Italic (Ctrl+I)">
          <Italic className={iconSize} />
        </ToolButton>
        <ToolButton onClick={() => applyStyle('underline')} title="Underline (Ctrl+U)">
          <Underline className={iconSize} />
        </ToolButton>
        <ToolButton onClick={() => applyStyle('strikeThrough')} title="Strikethrough">
          <Strikethrough className={iconSize} />
        </ToolButton>

        <Divider />

        {/* Text Color */}
        <div className="relative">
          <DropdownButton name="color" title="Text color">
            <Paintbrush className={iconSize} />
          </DropdownButton>
          
          {openDropdown === 'color' && (
            <div className="absolute left-0 top-full mt-1 w-52 bg-card rounded-xl border border-border shadow-xl p-3 z-50 animate-scale-in">
              <p className="text-xs font-medium text-muted-foreground mb-2">Text Color</p>
              <div className="grid grid-cols-8 gap-1.5">
                {TEXT_COLORS.map(color => (
                  <button
                    key={color.name}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleColorChange(color.value)}
                    title={color.name}
                    className={cn(
                      "w-5 h-5 rounded border border-border/50 hover:scale-125 hover:shadow-lg transition-all cursor-pointer",
                      TEXT_COLOR_SWATCH_CLASSES[color.value] ?? 'bg-muted'
                    )}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Highlight Color */}
        <div className="relative">
          <DropdownButton name="highlight" title="Highlight">
            <Highlighter className={iconSize} />
          </DropdownButton>
          
          {openDropdown === 'highlight' && (
            <div className="absolute left-0 top-full mt-1 w-44 bg-card rounded-xl border border-border shadow-xl p-3 z-50 animate-scale-in">
              <p className="text-xs font-medium text-muted-foreground mb-2">Highlight Color</p>
              <div className="grid grid-cols-4 gap-1.5">
                {HIGHLIGHT_COLORS.map(color => (
                  <button
                    key={color.name}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleHighlightChange(color.value)}
                    title={color.name}
                    className={cn(
                      "w-8 h-6 rounded border border-border/50 hover:scale-110 hover:shadow-md transition-all cursor-pointer text-xs flex items-center justify-center",
                      HIGHLIGHT_SWATCH_CLASSES[color.value] ?? 'bg-card'
                    )}
                  >
                    {color.value === 'transparent' && '✕'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <Divider />

        {/* Lists */}
        <ToolButton onClick={() => applyStyle('insertUnorderedList')} title="Bullet list">
          <List className={iconSize} />
        </ToolButton>
        <ToolButton onClick={() => applyStyle('insertOrderedList')} title="Numbered list">
          <ListOrdered className={iconSize} />
        </ToolButton>

        <Divider />

        {/* Alignment */}
        <div className="relative">
          <DropdownButton name="align" title="Text alignment">
            <AlignLeft className={iconSize} />
          </DropdownButton>
          
          {openDropdown === 'align' && (
            <div className="absolute left-0 top-full mt-1 w-36 bg-card rounded-xl border border-border shadow-xl p-1.5 z-50 animate-scale-in">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyStyle('justifyLeft')}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors flex items-center gap-2 text-sm"
              >
                <AlignLeft className="h-4 w-4" />
                Align Left
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyStyle('justifyCenter')}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors flex items-center gap-2 text-sm"
              >
                <AlignCenter className="h-4 w-4" />
                Center
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyStyle('justifyRight')}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors flex items-center gap-2 text-sm"
              >
                <AlignRight className="h-4 w-4" />
                Align Right
              </button>
            </div>
          )}
        </div>

        <Divider />

        {/* Quote */}
        <ToolButton onClick={() => applyStyle('formatBlock', 'blockquote')} title="Quote">
          <Quote className={iconSize} />
        </ToolButton>
      </div>

      {/* Click outside to close dropdowns */}
      {openDropdown && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={closeAllDropdowns} 
        />
      )}
    </div>
  );
};
