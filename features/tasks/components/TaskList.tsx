import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Task, TaskSettings } from '../types';
import { TaskItem } from './TaskItem';
import { cn } from '@/lib/utils';

interface TaskListProps {
  tasks: Task[];
  settings: TaskSettings;
  onToggleComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onTogglePin: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onDeleteSubtask: (taskId: string, subtaskId: string) => void;
  onUpdateTimeSpent: (id: string, seconds: number) => void;
  onReorder: (activeId: string, overId: string) => void;
  showPinAction?: boolean;
  showDuplicateAction?: boolean;
  alwaysShowActions?: boolean;
}

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  settings,
  onToggleComplete,
  onDelete,
  onUpdate,
  onTogglePin,
  onDuplicate,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onUpdateTimeSpent,
  onReorder,
  showPinAction = true,
  showDuplicateAction = true,
  alwaysShowActions = false,
}) => {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No tasks yet. Create one to get started! 🎯</p>
      </div>
    );
  }

  return (
    <motion.div className={cn('space-y-3', settings.compactMode && 'space-y-2')}>
      <AnimatePresence initial={false}>
        {tasks.map((task: Task) => (
          <TaskItem
            key={task.id}
            task={task}
            onToggleComplete={onToggleComplete}
            onDelete={onDelete}
            onUpdate={onUpdate}
            onTogglePin={onTogglePin}
            onDuplicate={onDuplicate}
            onAddSubtask={onAddSubtask}
            onToggleSubtask={onToggleSubtask}
            onDeleteSubtask={onDeleteSubtask}
            onUpdateTimeSpent={onUpdateTimeSpent}
            showTimer={settings.showTimer}
            showSubtasks={settings.showSubtasks}
            compactMode={settings.compactMode}
            showPinAction={showPinAction}
            showDuplicateAction={showDuplicateAction}
            alwaysShowActions={alwaysShowActions}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  );
};
