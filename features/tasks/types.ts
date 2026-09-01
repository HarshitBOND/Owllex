// Shared types for ravenslaw-todo
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type Category = 'hearing' | 'filing' | 'deposition' | 'client-meeting' | 'research' | 'case-review' | 'motion' | 'discovery';
export type SortOption = 'createdAt' | 'dueDate' | 'priority' | 'title' | 'category';
export type SortDirection = 'asc' | 'desc';
export type CaseStatus = 'active' | 'closed' | 'on-hold' | string;

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  priority: Priority;
  category: Category;
  dueDate: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  subtasks: Subtask[];
  tags: string[];
  timeSpent: number;
  isArchived: boolean;
  isPinned: boolean;
  reminder: Date | null;
  caseNumber?: string;
  courtName?: string;
  judgeName?: string;
  clientName?: string;
  opposingCounsel?: string;
  caseStatus?: CaseStatus;
}

export interface TaskFilter {
  search: string;
  priority: Priority | 'all';
  category: Category | 'all';
  status: 'all' | 'active' | 'completed';
  dateRange: 'all' | 'today' | 'week' | 'month' | 'overdue';
}

export interface TaskStats {
  total: number;
  completed: number;
  active: number;
  overdue: number;
  byPriority: Record<Priority, number>;
  byCategory: Record<Category, number>;
  completionRate: number;
  streak: number;
  upcomingHearings: number;
  pendingFilings: number;
  weeklyCompleted: number[];
}

export interface TaskSettings {
  soundEnabled: boolean;
  confettiEnabled: boolean;
  showSubtasks: boolean;
  showTimer: boolean;
  compactMode: boolean;
}
