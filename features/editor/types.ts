export interface Note {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: Date;
  updatedAt: Date;
  isPinned: boolean;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon?: string;
}

export type NoteEditorView = 'list' | 'editor';

// Re-export all types for clarity
export type { Note as NoteType, Category as CategoryType };

