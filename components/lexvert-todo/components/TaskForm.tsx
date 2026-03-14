import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { 
  Plus, 
  X, 
  Calendar, 
  Tag, 
  Flag, 
  Folder,
  ChevronDown,
  Sparkles,
  Scale,
  Building2,
  User,
  Hash
} from 'lucide-react';
import { Priority, Category, Task, CaseStatus } from '../types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface TaskFormProps {
  onSubmit: (task: Partial<Task>) => void;
  onCancel?: () => void;
  initialData?: Partial<Task>;
  isExpanded?: boolean;
}

const priorityOptions: { value: Priority; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: 'bg-muted-foreground' },
  { value: 'medium', label: 'Medium', color: 'bg-primary' },
  { value: 'high', label: 'High', color: 'bg-accent' },
  { value: 'urgent', label: 'Urgent', color: 'bg-destructive' },
];

const categoryOptions: { value: Category; label: string; icon: string }[] = [
  { value: 'hearing', label: 'Hearing', icon: '⚖️' },
  { value: 'filing', label: 'Filing', icon: '📋' },
  { value: 'deposition', label: 'Deposition', icon: '🎤' },
  { value: 'client-meeting', label: 'Client Meeting', icon: '🤝' },
  { value: 'research', label: 'Legal Research', icon: '🔍' },
  { value: 'case-review', label: 'Case Review', icon: '📂' },
  { value: 'motion', label: 'Motion', icon: '📝' },
  { value: 'discovery', label: 'Discovery', icon: '🔎' },
];

export const TaskForm: React.FC<TaskFormProps> = ({
  onSubmit,
  onCancel,
  initialData,
  isExpanded: initialExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [priority, setPriority] = useState<Priority>(initialData?.priority || 'medium');
  const [category, setCategory] = useState<Category>(initialData?.category || 'case-review');
  const [dueDate, setDueDate] = useState<Date | undefined>(initialData?.dueDate || undefined);
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  // Legal fields
  const [caseNumber, setCaseNumber] = useState(initialData?.caseNumber || '');
  const [courtName, setCourtName] = useState(initialData?.courtName || '');
  const [clientName, setClientName] = useState(initialData?.clientName || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSubmit({
      title: title.trim(),
      description: description.trim(),
      priority,
      category,
      dueDate: dueDate || null,
      tags,
      caseNumber: caseNumber.trim(),
      courtName: courtName.trim(),
      clientName: clientName.trim(),
    });

    setTitle('');
    setDescription('');
    setPriority('medium');
    setCategory('case-review');
    setDueDate(undefined);
    setTags([]);
    setCaseNumber('');
    setCourtName('');
    setClientName('');
    setIsExpanded(false);
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleQuickAdd = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isExpanded) {
      e.preventDefault();
      if (title.trim()) {
        onSubmit({ title: title.trim(), priority: 'medium', category: 'case-review' });
        setTitle('');
      }
    }
  };

  return (
    <motion.div
      layout
      className={cn(
        'rounded-xl border bg-card shadow-sm overflow-hidden transition-all duration-300',
        isExpanded ? 'shadow-lg border-primary/20' : ''
      )}
    >
      <form onSubmit={handleSubmit}>
        <div className="flex items-center gap-3 p-4">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
            <Plus className="w-4 h-4 text-primary-foreground" />
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleQuickAdd}
            onFocus={() => setIsExpanded(true)}
            placeholder="Add a new legal task... (Press Enter for quick add)"
            className="border-0 bg-transparent text-sm placeholder:text-muted-foreground focus-visible:ring-0 p-0 h-auto"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex-shrink-0 border border-border/70 bg-background/70 shadow-sm backdrop-blur-sm hover:shadow-md"
          >
            <ChevronDown className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-180')} />
          </Button>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-4 border-t pt-4">
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Case details, notes, or instructions..."
                  className="min-h-[80px] resize-none text-sm"
                />

                {/* Legal-specific fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={caseNumber}
                      onChange={(e) => setCaseNumber(e.target.value)}
                      placeholder="Case No."
                      className="pl-8 h-9 text-xs"
                    />
                  </div>
                  <div className="relative">
                    <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={courtName}
                      onChange={(e) => setCourtName(e.target.value)}
                      placeholder="Court Name"
                      className="pl-8 h-9 text-xs"
                    />
                  </div>
                  <div className="relative">
                    <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Client Name"
                      className="pl-8 h-9 text-xs"
                    />
                  </div>
                </div>

                {/* Options row */}
                <div className="flex flex-wrap gap-2">
                  <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                    <SelectTrigger className="w-[130px] h-9 text-xs">
                      <Flag className="w-3.5 h-3.5 mr-1" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {priorityOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <div className={cn('w-2 h-2 rounded-full', opt.color)} />
                            {opt.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                    <SelectTrigger className="w-[160px] h-9 text-xs">
                      <Scale className="w-3.5 h-3.5 mr-1" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <span>{opt.icon}</span>
                            {opt.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          'h-9 text-xs gap-1.5',
                          dueDate && 'text-primary border-primary'
                        )}
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        {dueDate ? format(dueDate, 'MMM d, yyyy') : 'Set deadline'}
                        {dueDate && (
                          <X
                            className="w-3 h-3 ml-1 hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDueDate(undefined);
                            }}
                          />
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dueDate}
                        onSelect={(date) => {
                          setDueDate(date);
                          setIsCalendarOpen(false);
                        }}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Tags */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="Add tags (e.g., civil, criminal, appeal)..."
                      className="flex-1 h-8 text-xs"
                    />
                    <Button type="button" variant="outline" size="sm" className="h-8" onClick={handleAddTag}>
                      Add
                    </Button>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-xs cursor-pointer hover:bg-destructive/10"
                          onClick={() => handleRemoveTag(tag)}
                        >
                          #{tag}
                          <X className="w-3 h-3 ml-1" />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Submit */}
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-muted-foreground">
                    Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Enter</kbd> for quick add
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsExpanded(false);
                        onCancel?.();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      className="bg-gradient-to-r from-primary to-accent text-primary-foreground gap-1.5"
                      disabled={!title.trim()}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Add Task
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </motion.div>
  );
};
