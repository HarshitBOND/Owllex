import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: LucideIcon;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
}

const variantStyles = {
  default: 'bg-card border-border',
  success: 'bg-gradient-to-br from-brand-50 to-teal-50 border-brand-200',
  warning: 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200',
  danger: 'bg-gradient-to-br from-rose-50 to-red-50 border-rose-200',
};

const iconStyles = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-brand-500/10 text-brand-600',
  warning: 'bg-amber-500/10 text-amber-600',
  danger: 'bg-rose-500/10 text-rose-600',
};

export function StatCard({
  title,
  value,
  change,
  changeType = 'neutral',
  icon: Icon,
  variant = 'default',
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg sm:rounded-xl border p-3 sm:p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-1',
        variantStyles[variant],
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-0.5 sm:space-y-2 min-w-0 flex-1">
          <p className="text-[10px] sm:text-sm font-medium text-muted-foreground truncate font-outfit">{title}</p>
          <p className="text-lg sm:text-3xl font-bold tracking-tight truncate font-outfit">{value}</p>
          {change && (
            <p
              className={cn(
                'text-[9px] sm:text-sm font-medium hidden sm:block',
                changeType === 'positive' && 'text-brand-600',
                changeType === 'negative' && 'text-rose-600',
                changeType === 'neutral' && 'text-muted-foreground'
              )}
            >
              {change}
            </p>
          )}
        </div>
        <div className={cn('rounded-lg sm:rounded-xl p-1.5 sm:p-3 shrink-0', iconStyles[variant])}>
          <Icon className="h-4 w-4 sm:h-6 sm:w-6" />
        </div>
      </div>
      
      {/* Decorative element */}
      <div className="absolute -right-4 -bottom-4 h-16 sm:h-24 w-16 sm:w-24 rounded-full bg-current opacity-5" />
    </div>
  );
}
