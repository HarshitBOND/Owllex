import React from 'react';
import { motion } from 'framer-motion';
import { format, isToday, isTomorrow, isPast, differenceInDays } from 'date-fns';
import { 
  Check, 
  Trash2, 
  Clock, 
  Pin, 
  PinOff, 
  Copy, 
  ChevronDown, 
  ChevronRight,
  GripVertical,
  Calendar,
  Play,
  Pause,
  Plus,
  X,
  AlertCircle,
  Edit3,
  Hash,
  Building2,
  User
} from 'lucide-react';
import { Task, Priority, Category } from '../types';
import { useTimer } from '../hooks/usetimer';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface TaskItemProps {
  task: Task;
  onToggleComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onTogglePin: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onDeleteSubtask: (taskId: string, subtaskId: string) => void;
  onUpdateTimeSpent: (id: string, seconds: number) => void;
  onComplete?: (e: React.MouseEvent) => void;
  showTimer?: boolean;
  showSubtasks?: boolean;
  compactMode?: boolean;
  showPinAction?: boolean;
  showDuplicateAction?: boolean;
  alwaysShowActions?: boolean;
}

const priorityConfig: Record<Priority, { label: string; color: string; bgColor: string }> = {
  low: { label: 'Low', color: 'text-muted-foreground', bgColor: 'bg-muted border-border' },
  medium: { label: 'Medium', color: 'text-primary', bgColor: 'bg-primary/10 border-primary/30' },
  high: { label: 'High', color: 'text-accent-foreground', bgColor: 'bg-accent/25 border-accent/40' },
  urgent: { label: 'Urgent', color: 'text-destructive', bgColor: 'bg-destructive/10 border-destructive/30' },
};

const categoryConfig: Record<Category, { label: string; color: string; icon: string }> = {
  hearing: { label: 'Hearing', color: 'bg-primary', icon: '⚖️' },
  filing: { label: 'Filing', color: 'bg-accent', icon: '📋' },
  deposition: { label: 'Deposition', color: 'bg-secondary', icon: '🎤' },
  'client-meeting': { label: 'Client Meeting', color: 'bg-primary/90', icon: '🤝' },
  research: { label: 'Research', color: 'bg-accent/90', icon: '🔍' },
  'case-review': { label: 'Case Review', color: 'bg-muted-foreground', icon: '📂' },
  motion: { label: 'Motion', color: 'bg-primary', icon: '📝' },
  discovery: { label: 'Discovery', color: 'bg-accent', icon: '🔎' },
};

export const TaskItem: React.FC<TaskItemProps> = ({
  task,
  onToggleComplete,
  onDelete,
  onUpdate,
  onTogglePin,
  onDuplicate,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onUpdateTimeSpent,
  onComplete,
  showTimer = true,
  showSubtasks = true,
  compactMode = false,
  showPinAction = true,
  showDuplicateAction = true,
  alwaysShowActions = false,
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState(task.title);
  const [newSubtask, setNewSubtask] = React.useState('');
  const [showSubtaskInput, setShowSubtaskInput] = React.useState(false);

  const { isRunning, formattedTime, toggle, reset, formatTime } = useTimer(
    (seconds: number) => onUpdateTimeSpent(task.id, seconds)
  );

  const subtaskProgress = task.subtasks.length > 0
    ? (task.subtasks.filter((st: any) => st.completed).length / task.subtasks.length) * 100
    : 0;

  const getDueDateLabel = () => {
    if (!task.dueDate) return null;
    const date = new Date(task.dueDate);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isPast(date) && !task.completed) return `${differenceInDays(new Date(), date)}d overdue`;
    return format(date, 'MMM d');
  };

  const dueDateLabel = getDueDateLabel();
  const isOverdue = task.dueDate && isPast(new Date(task.dueDate)) && !task.completed;

  const handleSaveEdit = () => {
    if (editTitle.trim()) onUpdate(task.id, { title: editTitle.trim() });
    setIsEditing(false);
  };

  const handleAddSubtask = () => {
    if (newSubtask.trim()) {
      onAddSubtask(task.id, newSubtask.trim());
      setNewSubtask('');
      setShowSubtaskInput(false);
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    if (!task.completed) onComplete?.(e);
    onToggleComplete(task.id);
  };

  const actionButtonClass =
    'h-7 w-7 p-0 border border-border/60 bg-background/75 shadow-sm backdrop-blur-sm hover:border-border/90 hover:bg-accent/60 hover:shadow-md';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100, height: 0 }}
      layout
      className={cn(
        'group relative rounded-xl border border-border/70 bg-card/95 p-4 shadow-sm transition-all duration-300',
        'hover:shadow-md hover:border-primary/30',
        task.completed && 'bg-muted/20',
        task.isPinned && 'border-primary/30 bg-primary/5',
        isOverdue && 'border-destructive/30',
        compactMode && 'p-3'
      )}
    >
      {task.isPinned && (
        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary animate-pulse" />
      )}

      <div className="flex items-start gap-3">

        <div className="mt-0.5">
          <Checkbox
            checked={task.completed}
            onCheckedChange={() => handleCheckboxClick({} as React.MouseEvent)}
            className={cn(
              'w-5 h-5 rounded-full border border-border/70 bg-background/90 shadow-sm transition-all duration-300',
              task.completed && 'animate-check border-success bg-success'
            )}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              {isEditing ? (
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={handleSaveEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEdit();
                    if (e.key === 'Escape') setIsEditing(false);
                  }}
                  autoFocus
                  className="h-7 text-sm"
                />
              ) : (
                <h3
                  className={cn(
                    'font-medium text-sm leading-tight cursor-pointer hover:text-primary transition-colors',
                    task.completed && 'line-through text-muted-foreground'
                  )}
                  onClick={() => setIsEditing(true)}
                >
                  {task.title}
                </h3>
              )}

              {/* Legal info row */}
              {(task.caseNumber || task.clientName || task.courtName) && (
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  {task.caseNumber && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Hash className="w-3 h-3" />{task.caseNumber}
                    </span>
                  )}
                  {task.clientName && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <User className="w-3 h-3" />{task.clientName}
                    </span>
                  )}
                  {task.courtName && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Building2 className="w-3 h-3" />{task.courtName}
                    </span>
                  )}
                </div>
              )}

              {/* Meta info row */}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge variant="secondary" className={cn('text-xs px-2 py-0.5', categoryConfig[task.category]?.color || 'bg-muted', 'text-white')}>
                  {categoryConfig[task.category]?.icon} {categoryConfig[task.category]?.label || task.category}
                </Badge>

                <Badge variant="outline" className={cn('text-xs px-2 py-0.5', priorityConfig[task.priority].color, priorityConfig[task.priority].bgColor)}>
                  {priorityConfig[task.priority].label}
                </Badge>

                {dueDateLabel && (
                  <Badge variant="outline" className={cn('text-xs px-2 py-0.5 gap-1', isOverdue && 'border-destructive text-destructive bg-destructive/10')}>
                    {isOverdue && <AlertCircle className="w-3 h-3" />}
                    <Calendar className="w-3 h-3" />
                    {dueDateLabel}
                  </Badge>
                )}

                {task.timeSpent > 0 && (
                  <Badge variant="outline" className="text-xs px-2 py-0.5 gap-1">
                    <Clock className="w-3 h-3" />{formatTime(task.timeSpent)}
                  </Badge>
                )}

                {task.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs px-2 py-0.5">#{tag}</Badge>
                ))}
              </div>

              {task.description && !compactMode && (
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{task.description}</p>
              )}

              {showSubtasks && task.subtasks.length > 0 && (
                <div className="mt-3">
                  <button onClick={() => setIsExpanded(!isExpanded)} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    <span>{task.subtasks.filter((st: any) => st.completed).length}/{task.subtasks.length} subtasks</span>
                  </button>
                  {isExpanded && (
                    <div className="mt-2 pl-2 space-y-1.5 border-l-2 border-muted">
                      {task.subtasks.map((subtask: any) => (
                        <div key={subtask.id} className="flex items-center gap-2 group/subtask">
                          <Checkbox
                            checked={subtask.completed}
                            onCheckedChange={() => onToggleSubtask(task.id, subtask.id)}
                            className="w-4 h-4 border border-border/70 bg-background/90"
                          />
                          <span className={cn('text-xs flex-1', subtask.completed && 'line-through text-muted-foreground')}>{subtask.title}</span>
                          <button onClick={() => onDeleteSubtask(task.id, subtask.id)} className="opacity-0 group-hover/subtask:opacity-100 transition-opacity">
                            <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                      ))}
                      {showSubtaskInput ? (
                        <div className="flex items-center gap-2">
                          <Input value={newSubtask} onChange={(e) => setNewSubtask(e.target.value)} placeholder="Add subtask..." className="h-6 text-xs"
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubtask(); if (e.key === 'Escape') setShowSubtaskInput(false); }}
                            autoFocus
                          />
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleAddSubtask}><Check className="w-3 h-3" /></Button>
                        </div>
                      ) : (
                        <button onClick={() => setShowSubtaskInput(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          <Plus className="w-3 h-3" />Add subtask
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div
              className={cn(
                'flex items-center gap-1 rounded-lg border border-border/70 bg-card/80 p-1 shadow-sm shadow-primary/5 backdrop-blur-md transition-all duration-200',
                alwaysShowActions ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
            >
              {showTimer && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    title={isRunning ? 'Pause timer' : 'Start timer'}
                    className={cn(actionButtonClass, isRunning && 'text-primary border-primary/40')}
                    onClick={toggle}
                  >
                    {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </Button>
                  {isRunning && <span className="text-xs font-mono text-primary animate-pulse">{formattedTime}</span>}
                </>
              )}
              <Button title="Edit" variant="ghost" size="sm" className={actionButtonClass} onClick={() => setIsEditing(true)}>
                <Edit3 className="w-3.5 h-3.5" />
              </Button>
              {showPinAction && (
                <Button
                  title={task.isPinned ? 'Unpin' : 'Pin to top'}
                  variant="ghost"
                  size="sm"
                  className={cn(actionButtonClass, task.isPinned && 'text-primary border-primary/40')}
                  onClick={() => onTogglePin(task.id)}
                >
                  {task.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                </Button>
              )}
              {showDuplicateAction && (
                <Button title="Duplicate" variant="ghost" size="sm" className={actionButtonClass} onClick={() => onDuplicate(task.id)}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button
                title="Delete"
                variant="ghost"
                size="sm"
                className={cn(actionButtonClass, 'hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30')}
                onClick={() => onDelete(task.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
