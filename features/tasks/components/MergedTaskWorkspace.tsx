"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ListTodo, Sparkles, Plus, LoaderCircle, Gavel, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { backendApiUrl } from "@/lib/backendApi";
import { parseCourtDate } from "@/lib/utils";
import type { Task as BackendTask } from "@/app/tasks/page";
import { useAuth } from "@clerk/nextjs";
import {
  TaskFilters,
  TaskList,
  TaskSettingsPanel,
  TaskStatsCard,
  type Category,
  type Priority,
  type SortDirection,
  type SortOption,
  type Task as ProTask,
  type TaskFilter,
  type TaskSettings,
  type TaskStats,
} from "@/features/tasks";

interface MergedTaskWorkspaceProps {
  tasks: BackendTask[];
  loading: boolean;
  onAddTask: () => void;
  onRefresh: () => void;
}

interface UpcomingHearing {
  _id?: string;
  caseNo?: string;
  caseTitle?: string;
  courtName?: string;
  courtDate?: string;
}

const allCategories: Category[] = [
  "hearing",
  "filing",
  "deposition",
  "client-meeting",
  "research",
  "case-review",
  "motion",
  "discovery",
];

const defaultSettings: TaskSettings = {
  soundEnabled: false,
  confettiEnabled: false,
  showSubtasks: false,
  showTimer: false,
  compactMode: false,
};

const getPriorityFromDueDate = (dueDateRaw: string | null | undefined): Priority => {
  if (!dueDateRaw) return "medium";

  const dueDate = new Date(dueDateRaw);
  if (Number.isNaN(dueDate.getTime())) return "medium";

  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "urgent";
  if (diffDays <= 1) return "high";
  if (diffDays <= 4) return "medium";
  return "low";
};

const getCategoryFromTask = (task: BackendTask): Category => {
  const label = `${task.task || ""} ${task.resourceType || ""}`.toLowerCase();

  if (label.includes("hearing") || label.includes("court")) return "hearing";
  if (label.includes("filing") || label.includes("file")) return "filing";
  if (label.includes("deposition")) return "deposition";
  if (label.includes("meeting") || label.includes("client")) return "client-meeting";
  if (label.includes("research")) return "research";
  if (label.includes("motion")) return "motion";
  if (label.includes("discovery")) return "discovery";

  return "case-review";
};

const isPriority = (value: unknown): value is Priority => {
  return ["low", "medium", "high", "urgent"].includes(value as Priority);
};

const isCategory = (value: unknown): value is Category => {
  return ["hearing", "filing", "deposition", "client-meeting", "research", "case-review", "motion", "discovery"].includes(
    value as Category,
  );
};

const getWeeklyCompleted = (tasks: ProTask[]): number[] => {
  const now = new Date();
  const days: number[] = [];

  for (let index = 6; index >= 0; index -= 1) {
    const day = new Date(now);
    day.setDate(day.getDate() - index);
    const dayStr = day.toDateString();
    const count = tasks.filter((task) => task.completedAt && new Date(task.completedAt).toDateString() === dayStr).length;
    days.push(count);
  }

  return days;
};

const calculateStreak = (tasks: ProTask[]): number => {
  const completedDates = tasks
    .filter((task) => task.completedAt)
    .map((task) => new Date(task.completedAt as Date).toDateString())
    .filter((date, index, self) => self.indexOf(date) === index)
    .sort((first, second) => new Date(second).getTime() - new Date(first).getTime());

  if (completedDates.length === 0) return 0;

  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();

  if (completedDates[0] !== today && completedDates[0] !== yesterday) {
    return 0;
  }

  let streak = 1;
  for (let index = 1; index < completedDates.length; index += 1) {
    const previous = new Date(completedDates[index - 1]);
    const current = new Date(completedDates[index]);
    const diff = previous.getTime() - current.getTime();

    if (diff <= 24 * 60 * 60 * 1000 * 1.5) {
      streak += 1;
      continue;
    }

    break;
  }

  return streak;
};

const getStats = (tasks: ProTask[]): TaskStats => {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed).length;
  const active = tasks.filter((task) => !task.completed).length;
  const overdue = tasks.filter((task) => task.dueDate && new Date(task.dueDate) < new Date() && !task.completed).length;

  const byPriority: Record<Priority, number> = {
    low: tasks.filter((task) => task.priority === "low").length,
    medium: tasks.filter((task) => task.priority === "medium").length,
    high: tasks.filter((task) => task.priority === "high").length,
    urgent: tasks.filter((task) => task.priority === "urgent").length,
  };

  const byCategory = allCategories.reduce((record, category) => {
    record[category] = tasks.filter((task) => task.category === category).length;
    return record;
  }, {} as Record<Category, number>);

  return {
    total,
    completed,
    active,
    overdue,
    byPriority,
    byCategory,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    streak: calculateStreak(tasks),
    upcomingHearings: tasks.filter(
      (task) => !task.completed && task.category === "hearing" && task.dueDate && new Date(task.dueDate) >= new Date(),
    ).length,
    pendingFilings: tasks.filter((task) => !task.completed && task.category === "filing").length,
    weeklyCompleted: getWeeklyCompleted(tasks),
  };
};

const mapBackendTaskToProTask = (task: BackendTask): ProTask => {
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const createdAt = task.createdAt ? new Date(task.createdAt) : new Date();
  const completed = task.status === "completed";

  const caseDetails = task.caseId as unknown as {
    caseNo?: string;
    title?: string;
    courtName?: string;
    status?: string;
  } | null;

  return {
    id: task._id,
    title: task.task || "Untitled Task",
    description: task.taskCompletedRemarks || "",
    completed,
    priority: isPriority(task.priority) ? task.priority : getPriorityFromDueDate(task.dueDate),
    category: isCategory(task.category) ? task.category : getCategoryFromTask(task),
    dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
    completedAt: completed ? (task.updatedAt ? new Date(task.updatedAt) : new Date()) : null,
    subtasks: [],
    tags: task.resourceType ? [task.resourceType] : [],
    timeSpent: 0,
    isArchived: false,
    isPinned: false,
    reminder: null,
    caseNumber: caseDetails?.caseNo || caseDetails?.title || "",
    courtName: caseDetails?.courtName || "",
    clientName: task.resourceName || "",
    opposingCounsel: "",
    caseStatus: caseDetails?.status || "active",
  };
};

export default function MergedTaskWorkspace({ tasks, loading, onAddTask, onRefresh }: MergedTaskWorkspaceProps) {
  const { toast } = useToast();
  const { getToken } = useAuth();
  const [filter, setFilter] = useState<TaskFilter>({
    search: "",
    priority: "all",
    category: "all",
    status: "all",
    dateRange: "all",
  });
  const [sortBy, setSortBy] = useState<SortOption>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [settings, setSettings] = useState<TaskSettings>(defaultSettings);
  const [upcomingHearings, setUpcomingHearings] = useState<UpcomingHearing[]>([]);
  const [upcomingHearingsLoading, setUpcomingHearingsLoading] = useState(false);

  const mappedTasks = useMemo(() => tasks.map(mapBackendTaskToProTask), [tasks]);

  useEffect(() => {
    if (loading) return;

    let isMounted = true;

    const fetchUpcomingHearings = async () => {
      setUpcomingHearingsLoading(true);
      try {
        const response = await fetch("/api/userdetails/dashboard");
        const data = await response.json();
        if (!isMounted) return;
        setUpcomingHearings(data?.upcomingHearings ?? []);
      } catch {
        if (!isMounted) return;
        setUpcomingHearings([]);
      } finally {
        if (isMounted) setUpcomingHearingsLoading(false);
      }
    };

    fetchUpcomingHearings();

    return () => {
      isMounted = false;
    };
  }, [loading, tasks.length]);

  const filteredTasks = useMemo(() => {
    return mappedTasks
      .filter((task) => {
        if (filter.search) {
          const query = filter.search.toLowerCase();
          const matches =
            task.title.toLowerCase().includes(query) ||
            task.description.toLowerCase().includes(query) ||
            (task.caseNumber || "").toLowerCase().includes(query) ||
            (task.clientName || "").toLowerCase().includes(query) ||
            (task.courtName || "").toLowerCase().includes(query);
          if (!matches) return false;
        }

        if (filter.priority !== "all" && task.priority !== filter.priority) return false;
        if (filter.category !== "all" && task.category !== filter.category) return false;
        if (filter.status === "active" && task.completed) return false;
        if (filter.status === "completed" && !task.completed) return false;

        if (filter.dateRange !== "all") {
          if (!task.dueDate) return false;

          const now = new Date();
          const dueDate = new Date(task.dueDate);
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

          if (filter.dateRange === "today" && dueDate.toDateString() !== today.toDateString()) {
            return false;
          }

          if (filter.dateRange === "week") {
            const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
            if (dueDate < today || dueDate > weekEnd) return false;
          }

          if (filter.dateRange === "month") {
            const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
            if (dueDate < today || dueDate > monthEnd) return false;
          }

          if (filter.dateRange === "overdue" && (dueDate >= today || task.completed)) {
            return false;
          }
        }

        return true;
      })
      .sort((first, second) => {
        let comparison = 0;

        if (sortBy === "createdAt") {
          comparison = new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
        }

        if (sortBy === "dueDate") {
          if (!first.dueDate && !second.dueDate) comparison = 0;
          else if (!first.dueDate) comparison = 1;
          else if (!second.dueDate) comparison = -1;
          else comparison = new Date(first.dueDate).getTime() - new Date(second.dueDate).getTime();
        }

        if (sortBy === "priority") {
          const priorityOrder: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
          comparison = priorityOrder[first.priority] - priorityOrder[second.priority];
        }

        if (sortBy === "title") comparison = first.title.localeCompare(second.title);
        if (sortBy === "category") comparison = first.category.localeCompare(second.category);

        return sortDirection === "asc" ? comparison : -comparison;
      });
  }, [mappedTasks, filter, sortBy, sortDirection]);

  const stats = useMemo(() => getStats(mappedTasks), [mappedTasks]);

  const updateTask = async (taskId: string, updates: Partial<ProTask>) => {
    const currentTask = tasks.find((task) => task._id === taskId);
    if (!currentTask) return;

    const nextPayload = {
      ...currentTask,
      task: updates.title ?? currentTask.task,
      taskCompletedRemarks:
        typeof updates.description === "string" ? updates.description : (currentTask.taskCompletedRemarks ?? ""),
      status: typeof updates.completed === "boolean" ? (updates.completed ? "completed" : "pending") : currentTask.status,
      dueDate: updates.dueDate ? new Date(updates.dueDate).toISOString() : currentTask.dueDate,
    };

    console.log("[tasks] PUT /api/userdetails/tasks payload", nextPayload);

    const token = await getToken();
    if (!token) {
      toast({ title: "Authentication required", description: "Please sign in again.", variant: "destructive" });
      return;
    }

    const response = await fetch(backendApiUrl("/api/userdetails/tasks"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(nextPayload),
    });

    const data = await response.json();
    if (!data.success) {
      toast({
        title: "Could not update task",
        description: "Please try again.",
        variant: "destructive",
      });
      return;
    }

    onRefresh();
  };

  const toggleComplete = async (taskId: string) => {
    const currentTask = tasks.find((task) => task._id === taskId);
    if (!currentTask) return;

    await updateTask(taskId, { completed: currentTask.status !== "completed" });
  };

  const deleteTask = async (taskId: string) => {
    const token = await getToken();
    if (!token) {
      toast({ title: "Authentication required", description: "Please sign in again.", variant: "destructive" });
      return;
    }

    const response = await fetch(backendApiUrl("/api/userdetails/tasks"), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ _id: taskId }),
    });

    const data = await response.json();
    if (!data.success) {
      toast({
        title: "Could not delete task",
        description: "Please try again.",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Task deleted" });
    onRefresh();
  };

  const handleArchiveCompleted = async () => {
    toast({
      title: "Archive not available for synced tasks",
      description: "Use Delete Completed to remove finished tasks.",
    });
  };

  const handleDeleteCompleted = async () => {
    const token = await getToken();
    if (!token) {
      toast({ title: "Authentication required", description: "Please sign in again.", variant: "destructive" });
      return;
    }

    const completedTasks = tasks.filter((task) => task.status === "completed");
    for (const task of completedTasks) {
      await fetch(backendApiUrl("/api/userdetails/tasks"), {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ _id: task._id }),
      });
    }
    toast({ title: "Completed tasks deleted" });
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/70 bg-card/95 p-5 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border/70 bg-muted/20 text-foreground">
              <ListTodo className="h-6 w-6" />
            </div>
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold text-foreground sm:text-2xl">
                <span>Lexvert</span>
                <span>Task Workspace</span>
                <Badge variant="secondary" className="text-[10px]">
                  <Sparkles className="mr-1 h-3 w-3" />
                  Pro Blend
                </Badge>
              </h1>
              <p className="text-sm text-muted-foreground">Unified legal task flow with backend sync and pro-grade interactions.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="border-border/80 bg-background/80 shadow-sm shadow-primary/10 hover:-translate-y-0.5 hover:shadow-md"
              onClick={onAddTask}
            >
              <Plus className="h-4 w-4" />
              Add New Task
            </Button>
            <TaskSettingsPanel
              settings={settings}
              setSettings={setSettings}
              onArchiveCompleted={handleArchiveCompleted}
              onDeleteCompleted={handleDeleteCompleted}
              onUndo={() => {}}
              canUndo={false}
              completedCount={stats.completed}
            />
          </div>
        </div>
      </div>

      <TaskStatsCard stats={stats} />

      <div className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Gavel className="h-4 w-4 text-violet-600" />
            Upcoming Hearings
          </h3>
          <span className="text-xs text-muted-foreground">{upcomingHearings.length} upcoming</span>
        </div>

        {upcomingHearingsLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading upcoming hearings
          </div>
        ) : upcomingHearings.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingHearings.slice(0, 6).map((hearing, index) => {
              const hearingDate = parseCourtDate(hearing.courtDate);

              return (
                <div
                  key={`${hearing._id || hearing.caseNo || "hearing"}-${index}`}
                  className="rounded-xl border border-border/70 bg-background/70 p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex min-w-[48px] flex-col items-center rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5">
                      <span className="text-[10px] font-medium text-violet-600">
                        {hearingDate ? hearingDate.toLocaleDateString("en-US", { month: "short" }) : "—"}
                      </span>
                      <span className="text-base font-bold text-violet-700">{hearingDate ? hearingDate.getDate() : "—"}</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {hearing.caseTitle || hearing.caseNo || "Untitled hearing"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{hearing.courtName || "Court not specified"}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {hearingDate
                          ? hearingDate.toLocaleDateString("en-IN", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })
                          : "Date unavailable"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No upcoming hearings found from your dashboard right now.</p>
        )}
      </div>

      <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
        <TaskFilters
          filter={filter}
          setFilter={setFilter}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortDirection={sortDirection}
          setSortDirection={setSortDirection}
        />
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>
          Showing <span className="font-semibold text-foreground">{filteredTasks.length}</span> tasks
        </p>
        {loading && (
          <div className="flex items-center gap-2 text-xs">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Refreshing tasks
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border/70 bg-card p-10">
          <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <TaskList
          tasks={filteredTasks}
          settings={settings}
          onToggleComplete={toggleComplete}
          onDelete={deleteTask}
          onUpdate={updateTask}
          onTogglePin={() => {}}
          onDuplicate={() => {}}
          onAddSubtask={() => {}}
          onToggleSubtask={() => {}}
          onDeleteSubtask={() => {}}
          onUpdateTimeSpent={() => {}}
          onReorder={() => {}}
          showPinAction={false}
          showDuplicateAction={false}
          alwaysShowActions
        />
      )}
    </div>
  );
}
