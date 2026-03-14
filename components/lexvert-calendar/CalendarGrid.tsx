import { motion } from 'framer-motion';
import { CalendarDay } from './CalendarDay';
import { CalendarEvent } from './useCalendarEvents';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
} from 'date-fns';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarGridProps {
  currentDate: Date;
  selectedDate: Date | null;
  events: CalendarEvent[];
  onSelectDate: (date: Date) => void;
  getEventsForDate: (date: string) => CalendarEvent[];
}

export const CalendarGrid = ({
  currentDate,
  selectedDate,
  onSelectDate,
  getEventsForDate,
}: CalendarGridProps) => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const today = new Date();

  return (
    <div className="space-y-1 sm:space-y-3">
      {/* Weekday Headers */}
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1.5">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="text-center text-[10px] sm:text-sm font-medium text-muted-foreground py-1 sm:py-2.5"
          >
            <span className="hidden sm:inline">{day}</span>
            <span className="sm:hidden">{day.charAt(0)}</span>
          </div>
        ))}
      </div>

      {/* Calendar Days */}
      <motion.div
        key={currentDate.toISOString()}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="grid grid-cols-7 gap-0.5 sm:gap-1.5"
      >
        {days.map((day, index) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayEvents = getEventsForDate(dateStr);

          return (
            <CalendarDay
              key={dateStr}
              date={day}
              isCurrentMonth={isSameMonth(day, currentDate)}
              isToday={isSameDay(day, today)}
              isSelected={selectedDate ? isSameDay(day, selectedDate) : false}
              events={dayEvents}
              onClick={() => onSelectDate(day)}
            />
          );
        })}
      </motion.div>
    </div>
  );
};
