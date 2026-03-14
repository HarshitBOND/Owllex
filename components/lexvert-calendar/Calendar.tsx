import { useState } from 'react';
import { addMonths, subMonths, format } from 'date-fns';
import { CalendarHeader } from './CalendarHeader';
import { CalendarGrid } from './CalendarGrid';
import { EventModal } from './EventModal';
import { UpcomingEvents } from './UpcomingEvents';
import { useCalendarEvents } from './useCalendarEvents';
import { motion } from 'framer-motion';

interface CalendarProps {
  /** When true, renders a compact version without title, outer padding, and sidebar */
  embedded?: boolean;
}

export const Calendar = ({ embedded = false }: CalendarProps) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { events, addEvent, deleteEvent, getEventsForDate } = useCalendarEvents();

  const handlePreviousMonth = () => {
    setCurrentDate((prev) => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate((prev) => addMonths(prev, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleSelectDate = (date: Date) => {
    setSelectedDate(date);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedDate(null);
  };

  const selectedDateEvents = selectedDate
    ? getEventsForDate(format(selectedDate, 'yyyy-MM-dd'))
    : [];

  // Compact/embedded mode for dashboard widgets
  if (embedded) {
    return (
      <div>
        <CalendarHeader
          currentDate={currentDate}
          onPreviousMonth={handlePreviousMonth}
          onNextMonth={handleNextMonth}
          onToday={handleToday}
        />
        <CalendarGrid
          currentDate={currentDate}
          selectedDate={selectedDate}
          events={events}
          onSelectDate={handleSelectDate}
          getEventsForDate={getEventsForDate}
        />
        <EventModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          selectedDate={selectedDate}
          events={selectedDateEvents}
          onAddEvent={addEvent}
          onDeleteEvent={deleteEvent}
        />
      </div>
    );
  }

  // Full-page mode
  return (
    <div className="min-h-screen bg-background p-2 sm:p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 sm:mb-8"
        >
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-1 sm:mb-2">
            My Calendar
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Track your important dates and events
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Main Calendar */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-3 bg-card rounded-lg sm:rounded-xl shadow-calendar border border-border p-2 sm:p-4 md:p-6"
          >
            <CalendarHeader
              currentDate={currentDate}
              onPreviousMonth={handlePreviousMonth}
              onNextMonth={handleNextMonth}
              onToday={handleToday}
            />
            <CalendarGrid
              currentDate={currentDate}
              selectedDate={selectedDate}
              events={events}
              onSelectDate={handleSelectDate}
              getEventsForDate={getEventsForDate}
            />
          </motion.div>

          {/* Sidebar */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-1"
          >
            <UpcomingEvents
              events={events}
              onEventClick={handleSelectDate}
            />
          </motion.div>
        </div>

        {/* Event Modal */}
        <EventModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          selectedDate={selectedDate}
          events={selectedDateEvents}
          onAddEvent={addEvent}
          onDeleteEvent={deleteEvent}
        />
      </div>
    </div>
  );
};
