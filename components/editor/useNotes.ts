import { useState, useCallback, useEffect } from 'react';
import { Note, Category } from './types';

const STORAGE_KEY = 'case-notes';
const CATEGORIES_KEY = 'case-categories';

const defaultCategories: Category[] = [
  { id: 'general', name: 'General', color: 'hsl(215 16% 47%)' },
  { id: 'important', name: 'Important', color: 'hsl(0 84% 60%)' },
  { id: 'case-notes', name: 'Case Notes', color: 'hsl(38 92% 50%)' },
  { id: 'evidence', name: 'Evidence', color: 'hsl(142 71% 45%)' },
  { id: 'follow-up', name: 'Follow-up', color: 'hsl(262 83% 58%)' },
];

const generateId = () => Math.random().toString(36).substring(2, 15);

export const useNotes = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [categories, setCategories] = useState<Category[]>(defaultCategories);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load notes from localStorage on mount
  useEffect(() => {
    const savedNotes = localStorage.getItem(STORAGE_KEY);
    const savedCategories = localStorage.getItem(CATEGORIES_KEY);
    
    if (savedNotes) {
      try {
        const parsed = JSON.parse(savedNotes);
        setNotes(parsed.map((note: Note) => ({
          ...note,
          createdAt: new Date(note.createdAt),
          updatedAt: new Date(note.updatedAt),
        })));
      } catch (e) {
        console.error('Failed to parse saved notes', e);
      }
    }
    
    if (savedCategories) {
      try {
        setCategories(JSON.parse(savedCategories));
      } catch (e) {
        console.error('Failed to parse saved categories', e);
      }
    }
  }, []);

  // Save notes to localStorage whenever they change
  useEffect(() => {
    if (notes.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    }
  }, [notes]);

  useEffect(() => {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  }, [categories]);

  const activeNote = notes.find(note => note.id === activeNoteId) || null;

  const filteredNotes = notes.filter(note => {
    const matchesSearch = note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         note.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || note.category === selectedCategory;
    return matchesSearch && matchesCategory;
  }).sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  const createNote = useCallback(() => {
    const newNote: Note = {
      id: generateId(),
      title: 'Untitled Note',
      content: '',
      category: selectedCategory || 'general',
      createdAt: new Date(),
      updatedAt: new Date(),
      isPinned: false,
    };
    setNotes(prev => [newNote, ...prev]);
    setActiveNoteId(newNote.id);
    return newNote;
  }, [selectedCategory]);

  const updateNote = useCallback((id: string, updates: Partial<Pick<Note, 'title' | 'content' | 'category' | 'isPinned'>>) => {
    setIsSaving(true);
    setNotes(prev => prev.map(note => 
      note.id === id 
        ? { ...note, ...updates, updatedAt: new Date() }
        : note
    ));
    // Simulate save delay for visual feedback
    setTimeout(() => setIsSaving(false), 500);
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => prev.filter(note => note.id !== id));
    if (activeNoteId === id) {
      setActiveNoteId(null);
    }
  }, [activeNoteId]);

  const togglePin = useCallback((id: string) => {
    setNotes(prev => prev.map(note =>
      note.id === id ? { ...note, isPinned: !note.isPinned, updatedAt: new Date() } : note
    ));
  }, []);

  return {
    notes: filteredNotes,
    allNotes: notes,
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
  };
};
