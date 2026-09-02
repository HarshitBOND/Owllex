import { Note, Category } from './types';
import { Pin, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NoteItemProps {
  note: Note;
  isActive: boolean;
  category?: Category;
  onClick: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}

export const NoteItem = ({ 
  note, 
  isActive, 
  category, 
  onClick, 
  onDelete,
  onTogglePin 
}: NoteItemProps) => {
  const getCategoryColorClass = (categoryId?: string) => {
    if (!categoryId) {
      return 'bg-muted-foreground';
    }
    const palette = [
      'bg-primary',
      'bg-secondary',
      'bg-accent',
      'bg-destructive',
      'bg-brand-500',
      'bg-indigo-500',
      'bg-rose-500',
      'bg-amber-500',
    ];
    let hash = 0;
    for (let index = 0; index < categoryId.length; index += 1) {
      hash = (hash * 31 + categoryId.charCodeAt(index)) >>> 0;
    }
    return palette[hash % palette.length];
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const getPreview = (content: string) => {
    const stripped = content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    return stripped.length > 80 ? stripped.substring(0, 80) + '...' : stripped || 'No content';
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative p-4 rounded-lg cursor-pointer transition-all duration-200",
        "border border-transparent",
        isActive 
          ? "bg-card border-note-active/30 note-shadow" 
          : "hover:bg-note-hover hover:border-note-border"
      )}
    >
      {/* Category indicator */}
      <div 
        className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full transition-all duration-200",
          getCategoryColorClass(category?.id)
        )}
      />

      {/* Pin indicator */}
      {note.isPinned && (
        <Pin 
          className="absolute top-3 right-3 h-3.5 w-3.5 text-note-active" 
          fill="currentColor"
        />
      )}

      <div className="pl-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className={cn(
            "font-medium text-sm line-clamp-1 flex-1",
            isActive ? "text-foreground" : "text-foreground/90"
          )}>
            {note.title || 'Untitled'}
          </h3>
        </div>
        
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {getPreview(note.content)}
        </p>
        
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">
            {formatDate(note.updatedAt)}
          </span>
          
          {/* Actions - show on hover */}
          <div className={cn(
            "flex items-center gap-1 transition-opacity duration-200",
            "opacity-0 group-hover:opacity-100"
          )}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin();
              }}
              className={cn(
                "p-1.5 rounded-md hover:bg-muted transition-colors",
                note.isPinned && "text-note-active"
              )}
            >
              <Pin className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 rounded-md hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
