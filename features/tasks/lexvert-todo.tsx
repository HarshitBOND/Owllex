import React, { useRef, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Scale, 
  Sparkles,
  Undo2,
  Keyboard,
  Moon,
  Sun
} from 'lucide-react';
import { useTaskStore } from './hooks/usetaskstore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { TaskForm } from './components/TaskForm';
import { TaskList } from './components/TaskList';
import { TaskFilters } from './components/TaskFIlter';
import { TaskStatsCard } from './components/TaskStats';
import { TaskSettingsPanel } from './components/TaskSettings';
import { playAddSound } from './utils/sounds';
import { fireConfetti, fireCelebration } from './utils/confetti';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface LexvertTodoTaskProps {
  className?: string;
}

export const LexvertTodoTask: React.FC<LexvertTodoTaskProps> = ({ className }) => {
  const {
    tasks, stats, filter, setFilter, sortBy, setSortBy, sortDirection, setSortDirection,
    settings, setSettings, addTask, updateTask, deleteTask, toggleComplete,
    addSubtask, toggleSubtask, deleteSubtask, reorderTasks, archiveCompleted,
    deleteCompleted, togglePin, updateTimeSpent, duplicateTask, undo, canUndo,
  } = useTaskStore();

  const { toast } = useToast();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const handleAddTask = useCallback((taskData: any) => {
    const newTask = addTask(taskData);
    if (settings.soundEnabled) playAddSound();
    toast({ title: "Task created! ⚖️", description: newTask.title });
  }, [addTask, settings.soundEnabled, toast]);

  const handleToggleComplete = useCallback((id: string) => {
    const task = tasks.find(t => t.id === id);
    if (task && !task.completed) {
      const activeCount = tasks.filter(t => !t.completed).length;
      if (activeCount === 1 && settings.confettiEnabled) fireCelebration();
    }
    toggleComplete(id);
  }, [tasks, toggleComplete, settings.confettiEnabled]);

  const handleArchiveCompleted = useCallback(() => {
    const count = stats.completed;
    archiveCompleted();
    toast({ title: "Tasks archived! 📦", description: `${count} completed tasks moved to archive` });
  }, [archiveCompleted, stats.completed, toast]);

  const handleDeleteCompleted = useCallback(() => {
    deleteCompleted();
    toast({ title: "Tasks deleted! 🗑️", description: "All completed tasks have been removed" });
  }, [deleteCompleted, toast]);

  const handleUndo = useCallback(() => {
    if (canUndo) {
      undo();
      toast({ title: "Undone! ↩️", description: "Last action has been reverted" });
    }
  }, [undo, canUndo, toast]);

  useKeyboardShortcuts({
    onNewTask: () => document.querySelector<HTMLInputElement>('[placeholder*="Add a new"]')?.focus(),
    onSearch: () => searchInputRef.current?.focus(),
    onUndo: handleUndo,
    onToggleSettings: () => {},
    onArchive: handleArchiveCompleted,
  });

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className={cn('min-h-screen gradient-hero py-8 px-4', className)}>
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
                <Scale className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <span className="text-gradient">Lexvert</span>
                  <span>Legal Tasks</span>
                  <Badge variant="secondary" className="text-[10px]">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Pro
                  </Badge>
                </h1>
                <p className="text-sm text-muted-foreground">
                  Case management & court task tracker
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canUndo && (
                <Button variant="outline" size="sm" onClick={handleUndo} className="gap-1.5">
                  <Undo2 className="w-4 h-4" />Undo
                </Button>
              )}
              <Button variant="outline" size="icon" onClick={toggleTheme} className="w-9 h-9">
                {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
              <TaskSettingsPanel
                settings={settings} setSettings={setSettings}
                onArchiveCompleted={handleArchiveCompleted}
                onDeleteCompleted={handleDeleteCompleted}
                onUndo={handleUndo} canUndo={canUndo}
                completedCount={stats.completed}
              />
            </div>
          </motion.header>

          {/* Stats Dashboard */}
          <TaskStatsCard stats={stats} />

          {/* Task Form */}
          <TaskForm onSubmit={handleAddTask} />

          {/* Filters */}
          <TaskFilters
            filter={filter} setFilter={setFilter}
            sortBy={sortBy} setSortBy={setSortBy}
            sortDirection={sortDirection} setSortDirection={setSortDirection}
            searchInputRef={searchInputRef}
          />

          {/* Task count */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing <span className="font-medium text-foreground">{tasks.length}</span> tasks
            </p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Keyboard className="w-3.5 h-3.5" />
              Press <kbd className="px-1.5 py-0.5 bg-muted rounded mx-1">?</kbd> for shortcuts
            </div>
          </div>

          {/* Task List */}
          <TaskList
            tasks={tasks} settings={settings}
            onToggleComplete={handleToggleComplete}
            onDelete={deleteTask} onUpdate={updateTask}
            onTogglePin={togglePin} onDuplicate={duplicateTask}
            onAddSubtask={addSubtask} onToggleSubtask={toggleSubtask}
            onDeleteSubtask={deleteSubtask} onUpdateTimeSpent={updateTimeSpent}
            onReorder={reorderTasks}
          />

          {/* Footer */}
          <motion.footer
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center py-4 text-xs text-muted-foreground"
          >
            <p>Built with ⚖️ by Lexvert • Drag tasks to reorder • Click to edit</p>
          </motion.footer>
        </div>
      </div>
  );
};

export default LexvertTodoTask;
