import React from 'react';
import { motion } from 'framer-motion';
import { 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  TrendingUp,
  Flame,
  Target,
  Zap,
  Scale,
  FileText,
  Gavel,
  CalendarClock
} from 'lucide-react';
import { TaskStats, Priority, Category } from '../types';
import { cn } from '@/lib/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';

interface TaskStatsCardProps {
  stats: TaskStats;
}

const PRIORITY_CHART_COLORS = ['hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(25, 95%, 53%)', 'hsl(0, 84%, 60%)'];
const PRIORITY_DOT_CLASSES = ['bg-[#22c55e]', 'bg-[#f59e0b]', 'bg-[#f97316]', 'bg-[#ef4444]'];

const RATE_WIDTH_CLASS_BY_BUCKET: Record<number, string> = {
  0: 'w-0',
  5: 'w-[5%]',
  10: 'w-[10%]',
  15: 'w-[15%]',
  20: 'w-[20%]',
  25: 'w-1/4',
  30: 'w-[30%]',
  35: 'w-[35%]',
  40: 'w-2/5',
  45: 'w-[45%]',
  50: 'w-1/2',
  55: 'w-[55%]',
  60: 'w-3/5',
  65: 'w-[65%]',
  70: 'w-[70%]',
  75: 'w-3/4',
  80: 'w-4/5',
  85: 'w-[85%]',
  90: 'w-[90%]',
  95: 'w-[95%]',
  100: 'w-full',
};

const categoryLabels: Record<Category, { label: string; icon: string }> = {
  hearing: { label: 'Hearing', icon: '⚖️' },
  filing: { label: 'Filing', icon: '📋' },
  deposition: { label: 'Deposition', icon: '🎤' },
  'client-meeting': { label: 'Meeting', icon: '🤝' },
  research: { label: 'Research', icon: '🔍' },
  'case-review': { label: 'Review', icon: '📂' },
  motion: { label: 'Motion', icon: '📝' },
  discovery: { label: 'Discovery', icon: '🔎' },
};

export const TaskStatsCard: React.FC<TaskStatsCardProps> = ({ stats }) => {
  const getCompletionRateWidthClass = (value: number) => {
    const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
    const bucket = Math.round(clamped / 5) * 5;
    return RATE_WIDTH_CLASS_BY_BUCKET[bucket] ?? 'w-0';
  };

  const statItems = [
    { label: 'Total', value: stats.total, icon: Target, color: 'text-primary', bgColor: 'bg-primary/10' },
    { label: 'Completed', value: stats.completed, icon: CheckCircle2, color: 'text-secondary', bgColor: 'bg-secondary/20' },
    { label: 'Active', value: stats.active, icon: Clock, color: 'text-accent', bgColor: 'bg-accent/20' },
    { label: 'Overdue', value: stats.overdue, icon: AlertTriangle, color: 'text-destructive', bgColor: 'bg-destructive/10' },
  ];

  const legalQuickStats = [
    { label: 'Upcoming Hearings', value: stats.upcomingHearings, icon: Gavel, color: 'text-primary' },
    { label: 'Pending Filings', value: stats.pendingFilings, icon: FileText, color: 'text-accent' },
  ];

  // Weekly activity data
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date().getDay();
  const weeklyData = stats.weeklyCompleted.map((count: number, i: number) => {
    const dayIndex = (today - 6 + i + 7) % 7;
    return { day: days[dayIndex === 0 ? 6 : dayIndex - 1], count };
  });

  // Priority pie data
  const priorityData = (Object.entries(stats.byPriority) as [Priority, number][])
    .map(([name, value], i) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value, fill: PRIORITY_CHART_COLORS[i] }))
    .filter(d => d.value > 0);

  // Category bar data
  const categoryData = (Object.entries(stats.byCategory) as [Category, number][])
    .filter((entry) => entry[1] > 0)
    .map(([cat, count]) => ({
      name: categoryLabels[cat]?.label || cat,
      count,
      icon: categoryLabels[cat]?.icon || '',
    }));

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Top row: main stats + legal quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statItems.map((item, index) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            className={cn('rounded-xl border border-border/70 bg-card/95 p-3 text-center', item.bgColor)}
          >
            <item.icon className={cn('w-5 h-5 mx-auto mb-1', item.color)} />
            <div className={cn('text-xl font-bold', item.color)}>{item.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{item.label}</div>
          </motion.div>
        ))}
        {legalQuickStats.map((item, index) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: (statItems.length + index) * 0.05 }}
            className="rounded-xl border border-border/70 bg-card/95 p-3 text-center"
          >
            <item.icon className={cn('w-5 h-5 mx-auto mb-1', item.color)} />
            <div className={cn('text-xl font-bold', item.color)}>{item.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide leading-tight">{item.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Completion rate + streak */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border/70 bg-card/95 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              Completion Rate
            </span>
            <span className="font-bold text-lg">{stats.completionRate}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full border border-border/60 bg-muted/35">
            <div className={cn('h-full rounded-full bg-primary/85 transition-all', getCompletionRateWidthClass(stats.completionRate))} />
          </div>
          {stats.streak > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs font-medium">
                <Flame className="w-3.5 h-3.5" />
                {stats.streak} day streak!
              </div>
            </div>
          )}
        </div>

        {/* Weekly Activity Chart */}
        <div className="rounded-xl border border-border/70 bg-card/95 p-4">
          <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
            <CalendarClock className="w-3.5 h-3.5" />
            Weekly Activity
          </h4>
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="weeklyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Area type="monotone" dataKey="count" stroke="hsl(217, 91%, 60%)" fill="url(#weeklyGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Priority Breakdown Pie */}
        <div className="rounded-xl border border-border/70 bg-card/95 p-4">
          <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
            <Zap className="w-3.5 h-3.5" />
            By Priority
          </h4>
          {priorityData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={100} height={100}>
                <PieChart>
                  <Pie data={priorityData} dataKey="value" cx="50%" cy="50%" innerRadius={25} outerRadius={45} paddingAngle={3}>
                    {priorityData.map((entry: any) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1">
                {priorityData.map((d: any) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <div className={cn('w-2.5 h-2.5 rounded-full', PRIORITY_DOT_CLASSES[priorityData.indexOf(d) % PRIORITY_DOT_CLASSES.length])} />
                    <span>{d.name}</span>
                    <span className="text-muted-foreground ml-auto">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-6">No tasks yet</p>
          )}
        </div>

        {/* Category Breakdown Bar */}
        <div className="rounded-xl border border-border/70 bg-card/95 p-4">
          <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
            <Scale className="w-3.5 h-3.5" />
            By Category
          </h4>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={categoryData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={65} axisLine={false} tickLine={false} />
                <Bar dataKey="count" fill="hsl(217, 91%, 60%)" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-6">No tasks yet</p>
          )}
        </div>
      </div>
    </motion.div>
  );
};
