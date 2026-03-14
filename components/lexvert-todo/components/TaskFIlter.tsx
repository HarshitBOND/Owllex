import React from 'react';
import { motion } from 'framer-motion';
import { 
  Search, 
  Filter, 
  X, 
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Calendar,
  Flag,
  Scale,
  CheckCircle2
} from 'lucide-react';
import { TaskFilter, Priority, Category, SortOption, SortDirection } from '../types';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TaskFiltersProps {
  filter: TaskFilter;
  setFilter: (filter: TaskFilter) => void;
  sortBy: SortOption;
  setSortBy: (sort: SortOption) => void;
  sortDirection: SortDirection;
  setSortDirection: (dir: SortDirection) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

const priorityOptions: { value: Priority | 'all'; label: string }[] = [
  { value: 'all', label: 'All Priorities' },
  { value: 'urgent', label: '🔴 Urgent' },
  { value: 'high', label: '🟠 High' },
  { value: 'medium', label: '🟡 Medium' },
  { value: 'low', label: '🟢 Low' },
];

const categoryOptions: { value: Category | 'all'; label: string }[] = [
  { value: 'all', label: 'All Categories' },
  { value: 'hearing', label: '⚖️ Hearing' },
  { value: 'filing', label: '📋 Filing' },
  { value: 'deposition', label: '🎤 Deposition' },
  { value: 'client-meeting', label: '🤝 Client Meeting' },
  { value: 'research', label: '🔍 Legal Research' },
  { value: 'case-review', label: '📂 Case Review' },
  { value: 'motion', label: '📝 Motion' },
  { value: 'discovery', label: '🔎 Discovery' },
];

const statusOptions: { value: 'all' | 'active' | 'completed'; label: string }[] = [
  { value: 'all', label: 'All Tasks' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
];

const dateOptions: { value: TaskFilter['dateRange']; label: string }[] = [
  { value: 'all', label: 'All Dates' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'overdue', label: 'Overdue' },
];

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'createdAt', label: 'Date Created' },
  { value: 'dueDate', label: 'Deadline' },
  { value: 'priority', label: 'Priority' },
  { value: 'title', label: 'Title' },
  { value: 'category', label: 'Category' },
];

export const TaskFilters: React.FC<TaskFiltersProps> = ({
  filter,
  setFilter,
  sortBy,
  setSortBy,
  sortDirection,
  setSortDirection,
  searchInputRef,
}) => {
  const activeFilters = [
    filter.priority !== 'all' && filter.priority,
    filter.category !== 'all' && filter.category,
    filter.status !== 'all' && filter.status,
    filter.dateRange !== 'all' && filter.dateRange,
    filter.search && 'search',
  ].filter(Boolean);

  const clearFilters = () => {
    setFilter({ search: '', priority: 'all', category: 'all', status: 'all', dateRange: 'all' });
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          placeholder="Search tasks, case numbers, clients, courts..."
          className="h-10 border border-border/70 bg-background/85 pl-10 pr-10 shadow-sm"
        />
        {filter.search && (
          <button
            onClick={() => setFilter({ ...filter, search: '' })}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-border/70 bg-background/70 p-1 shadow-sm backdrop-blur-sm transition-all hover:shadow-md"
          >
            <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filter.status} onValueChange={(v) => setFilter({ ...filter, status: v as any })}>
          <SelectTrigger className="h-8 w-[120px] border border-border/70 bg-background/85 text-xs shadow-sm">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border border-border/70 bg-background/95 shadow-md">
            {statusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filter.priority} onValueChange={(v) => setFilter({ ...filter, priority: v as any })}>
          <SelectTrigger className="h-8 w-[140px] border border-border/70 bg-background/85 text-xs shadow-sm">
            <Flag className="w-3.5 h-3.5 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border border-border/70 bg-background/95 shadow-md">
            {priorityOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filter.category} onValueChange={(v) => setFilter({ ...filter, category: v as any })}>
          <SelectTrigger className="h-8 w-[160px] border border-border/70 bg-background/85 text-xs shadow-sm">
            <Scale className="w-3.5 h-3.5 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border border-border/70 bg-background/95 shadow-md">
            {categoryOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filter.dateRange} onValueChange={(v) => setFilter({ ...filter, dateRange: v as any })}>
          <SelectTrigger className="h-8 w-[130px] border border-border/70 bg-background/85 text-xs shadow-sm">
            <Calendar className="w-3.5 h-3.5 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border border-border/70 bg-background/95 shadow-md">
            {dateOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 border border-border/70 bg-background/85 text-xs shadow-sm hover:bg-accent/60"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              Sort: {sortOptions.find(o => o.value === sortBy)?.label}
              {sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border border-border/70 bg-background/95 shadow-md">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {sortOptions.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => {
                  if (sortBy === opt.value) {
                    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                  } else {
                    setSortBy(opt.value);
                    setSortDirection('desc');
                  }
                }}
                className={cn(sortBy === opt.value && 'bg-muted')}
              >
                {opt.label}
                {sortBy === opt.value && (
                  sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 ml-auto" /> : <ArrowDown className="w-3 h-3 ml-auto" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {activeFilters.length > 0 && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 border border-border/70 bg-background/80 text-xs text-muted-foreground shadow-sm backdrop-blur-sm hover:text-destructive hover:shadow-md"
              onClick={clearFilters}
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Clear ({activeFilters.length})
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
};
