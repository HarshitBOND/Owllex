import { Note, Category } from './types';
import { NoteItem } from './NoteItem';
import { Search, Plus, FolderOpen, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NoteListProps {
  notes: Note[];
  categories: Category[];
  activeNoteId: string | null;
  searchQuery: string;
  selectedCategory: string | null;
  onSearchChange: (query: string) => void;
  onCategoryChange: (categoryId: string | null) => void;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (id: string) => void;
  onTogglePin: (id: string) => void;
  className?: string;
}

export const NoteList = ({
  notes,
  categories,
  activeNoteId,
  searchQuery,
  selectedCategory,
  onSearchChange,
  onCategoryChange,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onTogglePin,
  className,
}: NoteListProps) => {
  const getCategoryById = (id: string) => categories.find(c => c.id === id);

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Case Notes</h1>
          <button
            onClick={onCreateNote}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New</span>
          </button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-muted/50 border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-note-active/30 placeholder:text-muted-foreground/60 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Category filters */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1 -mx-4 px-4">
          <button
            onClick={() => onCategoryChange(null)}
            className={cn(
              "shrink-0 px-3 py-1 text-xs font-medium rounded-full transition-all duration-200",
              !selectedCategory
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            All
          </button>
          {categories.map(category => (
            <button
              key={category.id}
              onClick={() => onCategoryChange(category.id)}
              className={cn(
                "shrink-0 px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 flex items-center gap-1.5",
                selectedCategory === category.id
                  ? "text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
              style={selectedCategory === category.id ? { backgroundColor: category.color } : undefined}
            >
              <span 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: category.color }}
              />
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <FolderOpen className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              {searchQuery ? 'No notes found' : 'No notes yet'}
            </p>
            <p className="text-xs text-muted-foreground/60">
              {searchQuery ? 'Try a different search term' : 'Create your first case note'}
            </p>
            {!searchQuery && (
              <button
                onClick={onCreateNote}
                className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Create Note
              </button>
            )}
          </div>
        ) : (
          notes.map((note, index) => (
            <div
              key={note.id}
              className="animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <NoteItem
                note={note}
                isActive={activeNoteId === note.id}
                category={getCategoryById(note.category)}
                onClick={() => onSelectNote(note.id)}
                onDelete={() => onDeleteNote(note.id)}
                onTogglePin={() => onTogglePin(note.id)}
              />
            </div>
          ))
        )}
      </div>

      {/* Footer stats */}
      <div className="border-t border-border p-3 text-center">
        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          {selectedCategory && ` in ${getCategoryById(selectedCategory)?.name}`}
        </p>
      </div>
    </div>
  );
};
