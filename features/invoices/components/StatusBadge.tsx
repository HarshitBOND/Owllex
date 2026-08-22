import { InvoiceStatus } from '@/features/invoices/types';
import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, AlertCircle, FileEdit } from 'lucide-react';

interface StatusBadgeProps {
  status: InvoiceStatus;
  className?: string;
}

const statusConfig = {
  paid: {
    label: 'Paid',
    icon: CheckCircle2,
    className: 'status-paid',
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'status-pending',
  },
  overdue: {
    label: 'Overdue',
    icon: AlertCircle,
    className: 'status-overdue',
  },
  draft: {
    label: 'Draft',
    icon: FileEdit,
    className: 'status-draft',
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span className={cn('status-badge text-[10px] sm:text-xs px-1.5 py-0.5 sm:px-2.5 sm:py-1', config.className, className)}>
      <Icon className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5" />
      {config.label}
    </span>
  );
}
