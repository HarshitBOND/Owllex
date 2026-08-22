import { motion } from 'framer-motion';
import { CalendarClock, Scale } from 'lucide-react';
import { CalendarEvent } from './useCalendarEvents';
import { format, parseISO, isAfter, startOfDay } from 'date-fns';

interface UpcomingEventsProps {
  events: CalendarEvent[];
  onEventClick: (date: Date) => void;
}

export const UpcomingEvents = ({ events, onEventClick }: UpcomingEventsProps) => {
  const today = startOfDay(new Date());
  
  const upcomingEvents = events
    .filter((event) => {
      const eventDate = parseISO(event.date);
      return isAfter(eventDate, today) || format(eventDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
    })
    .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())
    .slice(0, 8);

  const hearingCount = upcomingEvents.filter(e => e.isHearing).length;

  return (
    <div className="bg-card rounded-lg sm:rounded-xl shadow-calendar border border-border p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3 sm:mb-4">
        <CalendarClock className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
        <h3 className="font-semibold text-sm sm:text-base text-foreground">Upcoming Events</h3>
      </div>

      {hearingCount > 0 && (
        <div className="flex items-center gap-2 mb-3 px-2 py-1.5 bg-violet-50 dark:bg-violet-500/10 rounded-md border border-violet-200 dark:border-violet-500/30">
          <Scale className="h-3.5 w-3.5 text-violet-600" />
          <span className="text-xs font-medium text-violet-700 dark:text-violet-300">{hearingCount} hearing{hearingCount !== 1 ? 's' : ''} coming up</span>
        </div>
      )}

      {upcomingEvents.length === 0 ? (
        <p className="text-xs sm:text-sm text-muted-foreground text-center py-4 sm:py-6">
          No upcoming events
        </p>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {upcomingEvents.map((event, index) => (
            <motion.button
              key={event.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onEventClick(parseISO(event.date))}
              className={`w-full text-left p-2 sm:p-3 rounded-lg transition-colors group ${
                event.isHearing 
                  ? 'bg-violet-50/80 hover:bg-violet-100/80 dark:bg-violet-500/10 dark:hover:bg-violet-500/20 border border-violet-200/50 dark:border-violet-500/20' 
                  : 'bg-secondary/50 hover:bg-secondary'
              }`}
            >
              <div className="flex items-start gap-2 sm:gap-3">
                <div className={`flex flex-col items-center min-w-[36px] sm:min-w-[40px] py-1 px-1.5 sm:px-2 rounded-md ${
                  event.isHearing ? 'bg-violet-100 dark:bg-violet-500/20' : 'bg-primary/10'
                }`}>
                  <span className={`text-[10px] sm:text-xs font-medium uppercase ${
                    event.isHearing ? 'text-violet-600 dark:text-violet-300' : 'text-primary'
                  }`}>
                    {format(parseISO(event.date), 'MMM')}
                  </span>
                  <span className={`text-base sm:text-lg font-bold ${
                    event.isHearing ? 'text-violet-700 dark:text-violet-200' : 'text-primary'
                  }`}>
                    {format(parseISO(event.date), 'd')}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-xs sm:text-sm text-foreground truncate group-hover:text-primary transition-colors">
                    {event.isHearing ? '⚖️ ' : ''}{event.title}
                  </h4>
                  {event.description && (
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                      {event.description}
                    </p>
                  )}
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
};
