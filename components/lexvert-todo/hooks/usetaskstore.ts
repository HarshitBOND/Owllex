import { useState, useCallback, useEffect } from 'react';
import { Task, TaskFilter, TaskStats, Priority, Category, SortOption, SortDirection, TaskSettings, Subtask } from '../types';

const STORAGE_KEY = 'lexvert-todo-tasks';
const SETTINGS_KEY = 'lexvert-todo-settings';

const defaultSettings: TaskSettings = {
  soundEnabled: true,
  confettiEnabled: true,
  showSubtasks: true,
  showTimer: true,
  compactMode: false,
};

const generateId = () => Math.random().toString(36).substring(2, 15);

const ALL_CATEGORIES: Category[] = ['hearing', 'filing', 'deposition', 'client-meeting', 'research', 'case-review', 'motion', 'discovery'];

export const useTaskStore = () => {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((task: any) => ({
        ...task,
        dueDate: task.dueDate ? new Date(task.dueDate) : null,
        createdAt: new Date(task.createdAt),
        completedAt: task.completedAt ? new Date(task.completedAt) : null,
        reminder: task.reminder ? new Date(task.reminder) : null,
      }));
    }
    return [];
  });

  const [settings, setSettings] = useState<TaskSettings>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(SETTINGS_KEY) : null;
    return saved ? JSON.parse(saved) : defaultSettings;
  });

  const [filter, setFilter] = useState<TaskFilter>({
    search: '',
    priority: 'all',
    category: 'all',
    status: 'all',
    dateRange: 'all',
  });

  const [sortBy, setSortBy] = useState<SortOption>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [undoStack, setUndoStack] = useState<Task[][]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  // Calculate weekly completed for chart
  const getWeeklyCompleted = (): number[] => {
    const now = new Date();
    const days: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(day.getDate() - i);
      const dayStr = day.toDateString();
      const count = tasks.filter(t => t.completedAt && new Date(t.completedAt).toDateString() === dayStr).length;
      days.push(count);
    }
    return days;
  };

  const stats: TaskStats = {
    total: tasks.filter(t => !t.isArchived).length,
    completed: tasks.filter(t => t.completed && !t.isArchived).length,
    active: tasks.filter(t => !t.completed && !t.isArchived).length,
    overdue: tasks.filter(t => {
      if (t.completed || t.isArchived || !t.dueDate) return false;
      return new Date(t.dueDate) < new Date();
    }).length,
    byPriority: {
      low: tasks.filter(t => t.priority === 'low' && !t.isArchived).length,
      medium: tasks.filter(t => t.priority === 'medium' && !t.isArchived).length,
      high: tasks.filter(t => t.priority === 'high' && !t.isArchived).length,
      urgent: tasks.filter(t => t.priority === 'urgent' && !t.isArchived).length,
    },
    byCategory: ALL_CATEGORIES.reduce((acc, cat) => {
      acc[cat] = tasks.filter(t => t.category === cat && !t.isArchived).length;
      return acc;
    }, {} as Record<Category, number>),
    completionRate: tasks.length > 0 
      ? Math.round((tasks.filter(t => t.completed && !t.isArchived).length / tasks.filter(t => !t.isArchived).length) * 100) || 0
      : 0,
    streak: calculateStreak(tasks),
    upcomingHearings: tasks.filter(t => !t.completed && !t.isArchived && t.category === 'hearing' && t.dueDate && new Date(t.dueDate) >= new Date()).length,
    pendingFilings: tasks.filter(t => !t.completed && !t.isArchived && t.category === 'filing').length,
    weeklyCompleted: getWeeklyCompleted(),
  };

  function calculateStreak(tasks: Task[]): number {
    const completedDates = tasks
      .filter(t => t.completedAt)
      .map(t => new Date(t.completedAt!).toDateString())
      .filter((date, index, self) => self.indexOf(date) === index)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    let streak = 0;
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    if (completedDates[0] === today || completedDates[0] === yesterday) {
      streak = 1;
      for (let i = 1; i < completedDates.length; i++) {
        const prevDate = new Date(completedDates[i - 1]);
        const currDate = new Date(completedDates[i]);
        const diff = prevDate.getTime() - currDate.getTime();
        if (diff <= 86400000 * 1.5) {
          streak++;
        } else {
          break;
        }
      }
    }
    return streak;
  }

  const saveUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-9), tasks]);
  }, [tasks]);

  const undo = useCallback(() => {
    if (undoStack.length > 0) {
      const previousState = undoStack[undoStack.length - 1];
      setTasks(previousState);
      setUndoStack(prev => prev.slice(0, -1));
    }
  }, [undoStack]);

  const addTask = useCallback((taskData: Partial<Task>) => {
    saveUndo();
    const newTask: Task = {
      id: generateId(),
      title: taskData.title || 'New Task',
      description: taskData.description || '',
      completed: false,
      priority: taskData.priority || 'medium',
      category: taskData.category || 'case-review',
      dueDate: taskData.dueDate || null,
      createdAt: new Date(),
      completedAt: null,
      subtasks: taskData.subtasks || [],
      tags: taskData.tags || [],
      timeSpent: 0,
      isArchived: false,
      isPinned: false,
      reminder: taskData.reminder || null,
      caseNumber: taskData.caseNumber || '',
      courtName: taskData.courtName || '',
      judgeName: taskData.judgeName || '',
      clientName: taskData.clientName || '',
      opposingCounsel: taskData.opposingCounsel || '',
      caseStatus: taskData.caseStatus || 'active',
    };
    setTasks(prev => [newTask, ...prev]);
    return newTask;
  }, [saveUndo]);

  const updateTask = useCallback((id: string, updates: Partial<Task>) => {
    saveUndo();
    setTasks(prev => prev.map(task => {
      if (task.id === id) {
        const updated = { ...task, ...updates };
        if (updates.completed && !task.completed) {
          updated.completedAt = new Date();
        } else if (updates.completed === false) {
          updated.completedAt = null;
        }
        return updated;
      }
      return task;
    }));
  }, [saveUndo]);

  const deleteTask = useCallback((id: string) => {
    saveUndo();
    setTasks(prev => prev.filter(task => task.id !== id));
  }, [saveUndo]);

  const toggleComplete = useCallback((id: string) => {
    setTasks(prev => prev.map(task => {
      if (task.id === id) {
        return {
          ...task,
          completed: !task.completed,
          completedAt: !task.completed ? new Date() : null,
        };
      }
      return task;
    }));
  }, []);

  const addSubtask = useCallback((taskId: string, title: string) => {
    saveUndo();
    const subtask: Subtask = { id: generateId(), title, completed: false };
    setTasks(prev => prev.map(task => {
      if (task.id === taskId) {
        return { ...task, subtasks: [...task.subtasks, subtask] };
      }
      return task;
    }));
  }, [saveUndo]);

  const toggleSubtask = useCallback((taskId: string, subtaskId: string) => {
    setTasks(prev => prev.map(task => {
      if (task.id === taskId) {
        return {
          ...task,
          subtasks: task.subtasks.map((st: any) => 
            st.id === subtaskId ? { ...st, completed: !st.completed } : st
          ),
        };
      }
      return task;
    }));
  }, []);

  const deleteSubtask = useCallback((taskId: string, subtaskId: string) => {
    saveUndo();
    setTasks(prev => prev.map(task => {
      if (task.id === taskId) {
        return { ...task, subtasks: task.subtasks.filter((st: any) => st.id !== subtaskId) };
      }
      return task;
    }));
  }, [saveUndo]);

  const reorderTasks = useCallback((activeId: string, overId: string) => {
    saveUndo();
    setTasks(prev => {
      const oldIndex = prev.findIndex(t => t.id === activeId);
      const newIndex = prev.findIndex(t => t.id === overId);
      const newTasks = [...prev];
      const [movedTask] = newTasks.splice(oldIndex, 1);
      newTasks.splice(newIndex, 0, movedTask);
      return newTasks;
    });
  }, [saveUndo]);

  const archiveCompleted = useCallback(() => {
    saveUndo();
    setTasks(prev => prev.map(task => 
      task.completed ? { ...task, isArchived: true } : task
    ));
  }, [saveUndo]);

  const deleteCompleted = useCallback(() => {
    saveUndo();
    setTasks(prev => prev.filter(task => !task.completed));
  }, [saveUndo]);

  const togglePin = useCallback((id: string) => {
    setTasks(prev => prev.map(task => 
      task.id === id ? { ...task, isPinned: !task.isPinned } : task
    ));
  }, []);

  const updateTimeSpent = useCallback((id: string, seconds: number) => {
    setTasks(prev => prev.map(task => 
      task.id === id ? { ...task, timeSpent: task.timeSpent + seconds } : task
    ));
  }, []);

  const duplicateTask = useCallback((id: string) => {
    saveUndo();
    const task = tasks.find(t => t.id === id);
    if (task) {
      const newTask: Task = {
        ...task,
        id: generateId(),
        title: `${task.title} (copy)`,
        completed: false,
        completedAt: null,
        createdAt: new Date(),
        timeSpent: 0,
      };
      setTasks(prev => [newTask, ...prev]);
    }
  }, [tasks, saveUndo]);

  // Filter and sort tasks
  const filteredTasks = tasks
    .filter(task => !task.isArchived)
    .filter(task => {
      if (filter.search) {
        const q = filter.search.toLowerCase();
        const matchesBasic = task.title.toLowerCase().includes(q) ||
          task.description.toLowerCase().includes(q);
        const matchesLegal = (task.caseNumber?.toLowerCase().includes(q)) ||
          (task.clientName?.toLowerCase().includes(q)) ||
          (task.courtName?.toLowerCase().includes(q)) ||
          (task.judgeName?.toLowerCase().includes(q));
        if (!matchesBasic && !matchesLegal) return false;
      }
      if (filter.priority !== 'all' && task.priority !== filter.priority) return false;
      if (filter.category !== 'all' && task.category !== filter.category) return false;
      if (filter.status === 'active' && task.completed) return false;
      if (filter.status === 'completed' && !task.completed) return false;
      
      if (filter.dateRange !== 'all' && task.dueDate) {
        const now = new Date();
        const dueDate = new Date(task.dueDate);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        switch (filter.dateRange) {
          case 'today':
            if (dueDate.toDateString() !== today.toDateString()) return false;
            break;
          case 'week': {
            const weekEnd = new Date(today.getTime() + 7 * 86400000);
            if (dueDate < today || dueDate > weekEnd) return false;
            break;
          }
          case 'month': {
            const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
            if (dueDate < today || dueDate > monthEnd) return false;
            break;
          }
          case 'overdue':
            if (dueDate >= today || task.completed) return false;
            break;
        }
      } else if (filter.dateRange === 'overdue' && !task.dueDate) {
        return false;
      }
      
      return true;
    })
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      let comparison = 0;
      switch (sortBy) {
        case 'createdAt':
          comparison = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          break;
        case 'dueDate':
          if (!a.dueDate && !b.dueDate) comparison = 0;
          else if (!a.dueDate) comparison = 1;
          else if (!b.dueDate) comparison = -1;
          else comparison = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
          break;
        case 'priority': {
          const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
          comparison = priorityOrder[a.priority as Priority] - priorityOrder[b.priority as Priority];
          break;
        }
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  const archivedTasks = tasks.filter(t => t.isArchived);

  return {
    tasks: filteredTasks,
    allTasks: tasks,
    archivedTasks,
    stats,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
    settings,
    setSettings,
    addTask,
    updateTask,
    deleteTask,
    toggleComplete,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
    reorderTasks,
    archiveCompleted,
    deleteCompleted,
    togglePin,
    updateTimeSpent,
    duplicateTask,
    undo,
    canUndo: undoStack.length > 0,
  };
};
