import { useState } from 'react';
import { NoteList } from './NoteList';
import { Editor } from './Editior';
import { useNotes } from './useNotes';
import { NoteEditorView } from './types';
import { cn } from '@/lib/utils';

interface NoteEditorProps {
  className?: string;
}

export const NoteEditor = ({ className }: NoteEditorProps) => {
  const {
    notes,
    categories,
    activeNote,
    activeNoteId,
    setActiveNoteId,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    createNote,
    updateNote,
    deleteNote,
    togglePin,
    isSaving,
  } = useNotes();

  // Mobile view state
  const [mobileView, setMobileView] = useState<NoteEditorView>('list');

  const handleSelectNote = (id: string) => {
    setActiveNoteId(id);
    setMobileView('editor');
  };

  const handleCreateNote = () => {
    const note = createNote();
    setMobileView('editor');
    return note;
  };

  const handleBack = () => {
    setMobileView('list');
  };

  return (
    <div className={cn(
      "flex h-full w-full overflow-hidden rounded-xl border border-border bg-background note-shadow",
      className
    )}>
      {/* Note List - hidden on mobile when viewing editor */}
      <div className={cn(
        "w-full lg:w-80 xl:w-96 border-r border-border flex-shrink-0 transition-all duration-300",
        mobileView === 'editor' ? "hidden lg:flex" : "flex"
      )}>
        <NoteList
          notes={notes}
          categories={categories}
          activeNoteId={activeNoteId}
          searchQuery={searchQuery}
          selectedCategory={selectedCategory}
          onSearchChange={setSearchQuery}
          onCategoryChange={setSelectedCategory}
          onSelectNote={handleSelectNote}
          onCreateNote={handleCreateNote}
          onDeleteNote={deleteNote}
          onTogglePin={togglePin}
          className="w-full"
        />
      </div>

      {/* Editor - hidden on mobile when viewing list */}
      <div className={cn(
        "flex-1 min-w-0 transition-all duration-300",
        mobileView === 'list' ? "hidden lg:block" : "block"
      )}>
        <Editor
          note={activeNote}
          categories={categories}
          isSaving={isSaving}
          onBack={handleBack}
          onUpdate={updateNote}
          onTogglePin={togglePin}
        />
      </div>
    </div>
  );
};

export default NoteEditor;
export * from './types';
