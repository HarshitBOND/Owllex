import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { parseCourtDate } from '@/lib/utils';

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // ISO date string YYYY-MM-DD
  description?: string;
  color?: string;
  isHearing?: boolean; // true if this event came from a case hearing
  caseId?: string; // link back to case
}

const STORAGE_KEY = 'calendar-events';

export const useCalendarEvents = () => {
  const [userEvents, setUserEvents] = useState<CalendarEvent[]>([]);
  const [hearingEvents, setHearingEvents] = useState<CalendarEvent[]>([]);

  // Load user events from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setUserEvents(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse stored events:', e);
      }
    }
  }, []);

  // Fetch hearing dates from API
  useEffect(() => {
    fetch('/api/userdetails/dashboard')
      .then((res) => res.json())
      .then((data) => {
        const hearings = data?.upcomingHearings || [];
        const mapped: CalendarEvent[] = hearings
          .filter((h: any) => h.courtDate && parseCourtDate(h.courtDate))
          .map((h: any) => ({
            id: `hearing-${h._id}`,
            title: h.caseTitle || h.caseNo || 'Hearing',
            date: format(parseCourtDate(h.courtDate)!, 'yyyy-MM-dd'),
            description: [h.courtName, h.courtRoom ? `Room ${h.courtRoom}` : ''].filter(Boolean).join(' · '),
            color: 'violet',
            isHearing: true,
            caseId: h._id,
          }));
        setHearingEvents(mapped);
      })
      .catch(() => {});
  }, []);

  // Save user events to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userEvents));
  }, [userEvents]);

  // Merge user events + hearing events
  const events = useMemo(() => [...userEvents, ...hearingEvents], [userEvents, hearingEvents]);

  const addEvent = (event: Omit<CalendarEvent, 'id'>) => {
    const newEvent: CalendarEvent = {
      ...event,
      id: crypto.randomUUID(),
    };
    setUserEvents((prev) => [...prev, newEvent]);
    return newEvent;
  };

  const updateEvent = (id: string, updates: Partial<Omit<CalendarEvent, 'id'>>) => {
    setUserEvents((prev) =>
      prev.map((event) =>
        event.id === id ? { ...event, ...updates } : event
      )
    );
  };

  const deleteEvent = (id: string) => {
    // Don't allow deleting hearing events
    setUserEvents((prev) => prev.filter((event) => event.id !== id));
  };

  const getEventsForDate = (date: string): CalendarEvent[] => {
    return events.filter((event) => event.date === date);
  };

  return {
    events,
    addEvent,
    updateEvent,
    deleteEvent,
    getEventsForDate,
  };
};
