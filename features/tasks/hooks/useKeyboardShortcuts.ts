import { useEffect } from 'react';

type Shortcuts = Partial<{
  onNewTask: () => void;
  onSearch: () => void;
  onUndo: () => void;
  onToggleSettings: () => void;
  onArchive: () => void;
}>;

export const useKeyboardShortcuts = (handlers: Shortcuts) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // '?' for help (Shift+/)
      if (e.key === '?') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        handlers.onNewTask?.();
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        handlers.onSearch?.();
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        handlers.onUndo?.();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        handlers.onArchive?.();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlers]);
};
