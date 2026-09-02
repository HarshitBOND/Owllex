import { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { Note, Category } from './types';
import { FormattingToolbar } from './FormattingToolBar';
import { 
  ArrowLeft, 
  Check,
  Pin,
  Clock,
  Tag,
  MoreVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditorProps {
  note: Note | null;
  categories: Category[];
  isSaving: boolean;
  onBack: () => void;
  onUpdate: (id: string, updates: Partial<Pick<Note, 'title' | 'content' | 'category' | 'isPinned'>>) => void;
  onTogglePin: (id: string) => void;
  className?: string;
}

export const Editor = ({
  note,
  categories,
  isSaving,
  onBack,
  onUpdate,
  onTogglePin,
  className,
}: EditorProps) => {
  const sanitizeHtml = (value: string) =>
    DOMPurify.sanitize(value, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li',
        'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'a'
      ],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
      FORBID_ATTR: ['style', 'onerror', 'onclick', 'onload'],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    });

  const addSafeLinkRel = (html: string) => {
    if (typeof window === 'undefined') return html;
    if (!html.includes('<a')) return html;

    const temp = document.createElement('div');
    temp.innerHTML = html;

    temp.querySelectorAll('a').forEach((link) => {
      link.setAttribute('rel', 'noopener noreferrer');
      link.setAttribute('target', '_blank');
    });

    return temp.innerHTML;
  };

  const [localTitle, setLocalTitle] = useState('');
  const [localContent, setLocalContent] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  const titleRef = useRef<HTMLInputElement>(null);
  const noteIdRef = useRef(note?.id);

  useEffect(() => {
    if (note) {
      setLocalTitle(note.title);
      const safeContent = addSafeLinkRel(sanitizeHtml(note.content || ''));
      setLocalContent(safeContent);
      if (contentRef.current && contentRef.current.innerHTML !== safeContent) {
        contentRef.current.innerHTML = safeContent;
      }
    }
  }, [note]);

  useEffect(() => {
    noteIdRef.current = note?.id;
  }, [note]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (
        note &&
        noteIdRef.current === note.id &&
        (localTitle !== note.title || localContent !== note.content)
      ) {
        onUpdate(note.id, { title: localTitle, content: localContent });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [localTitle, localContent, note, onUpdate]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString([], { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatShortDate = (date: Date) => {
    return date.toLocaleDateString([], { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleContentChange = () => {
    if (!contentRef.current) return;

    const sanitized = addSafeLinkRel(
      sanitizeHtml(contentRef.current.innerHTML)
    );

    setLocalContent(prev => (prev === sanitized ? prev : sanitized));
  };

  const currentCategory = categories.find(c => c.id === note?.category);

  if (!note) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full bg-background", className)}>
        <div className="text-center p-8">
          <div className="w-20 h-20 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-muted-foreground/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z" />
              <path d="M8 7h8M8 11h8M8 15h4" />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground mb-1">Select a note to edit</p>
          <p className="text-xs text-muted-foreground/60">Or create a new one to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Mobile Header - Redesigned for professional look */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border lg:hidden">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="text-sm font-medium">Notes</span>
          </button>

          <div className="flex items-center gap-2">
            {/* Save Status */}
            <div className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
              isSaving 
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" 
                : "bg-brand-500/10 text-brand-600 dark:text-brand-400"
            )}>
              {isSaving ? (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  <span>Saving</span>
                </>
              ) : (
                <>
                  <Check className="h-3 w-3" />
                  <span>Saved</span>
                </>
              )}
            </div>

            {/* More Menu */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <MoreVertical className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {showMobileMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMobileMenu(false)} />
            <div className="absolute right-4 top-14 w-56 bg-card rounded-xl border border-border shadow-xl z-50 overflow-hidden animate-scale-in">
              <div className="p-2">
                <button
                  onClick={() => {
                    onTogglePin(note.id);
                    setShowMobileMenu(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                    note.isPinned ? "text-note-active" : "text-foreground hover:bg-muted"
                  )}
                >
                  <Pin className="h-4 w-4" fill={note.isPinned ? "currentColor" : "none"} />
                  {note.isPinned ? 'Unpin note' : 'Pin note'}
                </button>
                
                <div className="my-1.5 mx-3 border-t border-border" />
                
                <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Category
                </p>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      onUpdate(note.id, { category: cat.id });
                      setShowMobileMenu(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                      note.category === cat.id ? "bg-muted" : "hover:bg-muted/50"
                    )}
                  >
                    <span className={cn("w-3 h-3 rounded-full", cat.color || 'bg-muted-foreground')} />
                    <span className="flex-1 text-left">{cat.name}</span>
                    {note.category === cat.id && (
                      <Check className="h-4 w-4 text-note-active" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Formatting Toolbar for Mobile */}
        <div className="border-t border-border/50 bg-muted/30">
          <FormattingToolbar contentRef={contentRef} onContentChange={handleContentChange} isMobile={true} />
        </div>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:block sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between p-3 gap-2">
          <button
            onClick={onBack}
            className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {isSaving ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-note-active animate-pulse-soft" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5 text-brand-500" />
                  <span>Saved</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onTogglePin(note.id)}
              className={cn(
                "p-2 rounded-lg transition-colors",
                note.isPinned ? "text-note-active bg-note-active/10" : "hover:bg-muted text-muted-foreground"
              )}
            >
              <Pin className="h-4 w-4" fill={note.isPinned ? "currentColor" : "none"} />
            </button>
            
            <div className="relative">
              <button
                onClick={() => setShowCategoryPicker(!showCategoryPicker)}
                className="p-2 rounded-lg hover:bg-muted transition-colors flex items-center gap-1.5"
              >
                <span className={cn("w-3 h-3 rounded-full", currentCategory?.color || 'bg-muted-foreground')} />
                <Tag className="h-4 w-4 text-muted-foreground" />
              </button>
              
              {showCategoryPicker && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-card rounded-xl border border-border shadow-lg p-2 z-50 animate-scale-in">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        onUpdate(note.id, { category: cat.id });
                        setShowCategoryPicker(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                        note.category === cat.id ? "bg-muted" : "hover:bg-muted/50"
                      )}
                    >
                      <span className={cn("w-3 h-3 rounded-full", cat.color || 'bg-muted-foreground')} />
                      {cat.name}
                      {note.category === cat.id && (
                        <Check className="h-4 w-4 ml-auto text-note-active" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Formatting Toolbar for Desktop */}
        <FormattingToolbar contentRef={contentRef} onContentChange={handleContentChange} isMobile={false} />
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto p-4 sm:p-6">
          {/* Title - Mobile optimized */}
          <div className="lg:hidden mb-4">
            <input
              ref={titleRef}
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              placeholder="Note title..."
              className="w-full text-xl font-bold bg-transparent border-0 outline-none placeholder:text-muted-foreground/40"
            />
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                <span>{formatShortDate(note.updatedAt)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={cn("w-2 h-2 rounded-full", currentCategory?.color || 'bg-muted-foreground')} />
                <span>{currentCategory?.name}</span>
              </div>
              {note.isPinned && (
                <div className="flex items-center gap-1 text-note-active">
                  <Pin className="h-3 w-3" fill="currentColor" />
                  <span>Pinned</span>
                </div>
              )}
            </div>
          </div>

          {/* Title - Desktop */}
          <input
            type="text"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            placeholder="Note title..."
            className="hidden lg:block w-full text-2xl sm:text-3xl font-bold bg-transparent border-0 outline-none placeholder:text-muted-foreground/40 mb-3"
          />

          {/* Metadata - Desktop only */}
          <div className="hidden lg:flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-6 pb-6 border-b border-border/50">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>{formatDate(note.updatedAt)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={cn("w-2.5 h-2.5 rounded-full", currentCategory?.color || 'bg-muted-foreground')} />
              <span>{currentCategory?.name}</span>
            </div>
          </div>

          {/* Content */}
          <div
            ref={contentRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            onInput={handleContentChange}
            onBlur={handleContentChange}
            className={cn(
              "min-h-[50vh] outline-none leading-relaxed",
              "prose prose-sm sm:prose-base max-w-none",
              "prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5",
              "prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg",
              "prose-blockquote:border-l-4 prose-blockquote:border-note-active prose-blockquote:pl-4 prose-blockquote:italic",
              "prose-pre:bg-muted prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto",
              "prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm",
              "lg:text-base text-sm caret-[hsl(var(--note-active))]"
            )}
            data-placeholder="Start writing your case notes..."
          />
        </div>
      </div>

      {/* Mobile Bottom Spacing for touch targets */}
      <div className="lg:hidden h-4" />

      {/* Click outside to close category picker */}
      {showCategoryPicker && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowCategoryPicker(false)} 
        />
      )}
    </div>
  );
};
