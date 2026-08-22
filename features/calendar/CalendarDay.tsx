import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CalendarEvent } from './useCalendarEvents';

interface CalendarDayProps {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  events: CalendarEvent[];
  onClick: () => void;
}

export const CalendarDay = ({
  date,
  isCurrentMonth,
  isToday,
  isSelected,
  events,
  onClick,
}: CalendarDayProps) => {
  const hasEvents = events.length > 0;

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'relative aspect-square sm:aspect-auto sm:h-[6.5rem] md:h-[7.5rem] p-1 sm:p-2.5 border border-border/50 rounded-md sm:rounded-lg transition-all duration-200',
        'hover:bg-calendar-hover hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/20',
        isCurrentMonth ? 'bg-card' : 'bg-muted/30',
        isSelected && 'ring-2 ring-primary bg-primary/5',
        isToday && 'border-primary'
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center w-5 h-5 sm:w-7 sm:h-7 text-[10px] sm:text-sm font-medium rounded-full transition-colors sm:absolute sm:top-2 sm:left-2',
          isToday && 'bg-primary text-primary-foreground',
          !isCurrentMonth && 'text-muted-foreground',
          isCurrentMonth && !isToday && 'text-foreground'
        )}
      >
        {date.getDate()}
      </span>

      {hasEvents && (
        <>
          {/* Mobile: just show a dot indicator */}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5 sm:hidden">
            {events.slice(0, 3).map((event) => (
              <div
                key={event.id}
                className="w-1 h-1 rounded-full bg-primary"
              />
            ))}
          </div>
          
          {/* Desktop: show event titles */}
          <div className="hidden sm:block absolute bottom-2 left-2 right-2 space-y-1 overflow-hidden">
            {events.slice(0, 2).map((event, index) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  "text-xs px-2 py-0.5 rounded font-medium truncate",
                  event.isHearing
                    ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
                    : "bg-calendar-event-light text-calendar-event"
                )}
              >
                {event.isHearing ? '⚖️ ' : ''}{event.title}
              </motion.div>
            ))}
            {events.length > 2 && (
              <span className="text-xs text-muted-foreground pl-2">
                +{events.length - 2} more
              </span>
            )}
          </div>
        </>
      )}
    </motion.button>
  );
};
