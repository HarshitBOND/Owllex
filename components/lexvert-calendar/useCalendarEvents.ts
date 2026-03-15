import { useCallback, useEffect, useMemo, useState } from 'react';

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  description?: string | null;
  color?: 'blue' | 'violet' | 'emerald' | 'amber' | 'rose';
  sourceType?: 'manual' | 'task' | 'hearing';
  isHearing?: boolean;
  isTask?: boolean;
  isManual?: boolean;
  caseId?: string | null;
  taskId?: string | null;
  reminderEnabled?: boolean;
  reminderOffsets?: number[];
  canEdit?: boolean;
  canDelete?: boolean;
  resourceUrl?: string | null;
}

type CalendarResponse = {
  success: boolean;
  events?: CalendarEvent[];
  event?: CalendarEvent;
  error?: string;
};

const normalizeEvent = (event: CalendarEvent): CalendarEvent => ({
  ...event,
  description: event.description || undefined,
  isHearing: Boolean(event.isHearing || event.sourceType === 'hearing'),
  isTask: Boolean(event.isTask || event.sourceType === 'task'),
  isManual: Boolean(event.isManual || event.sourceType === 'manual'),
  canEdit: typeof event.canEdit === 'boolean' ? event.canEdit : event.sourceType === 'manual',
  canDelete: typeof event.canDelete === 'boolean' ? event.canDelete : event.sourceType === 'manual',
});

export const useCalendarEvents = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  const fetchEvents = useCallback(async () => {
    try {
      const response = await fetch('/api/userdetails/calendar', { cache: 'no-store' });
      const data = (await response.json()) as CalendarResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load calendar events');
      }

      setEvents((data.events || []).map((event) => normalizeEvent(event)));
    } catch (error) {
      console.error('Failed to fetch calendar events:', error);
    }
  }, []);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const addEvent = useCallback(
    async (event: Omit<CalendarEvent, 'id'>) => {
      const payload = {
        title: event.title,
        description: event.description || '',
        date: event.date,
        color: event.color || 'blue',
        reminderEnabled: Boolean(event.reminderEnabled),
        reminderOffsets: event.reminderOffsets || [],
      };

      const response = await fetch('/api/userdetails/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as CalendarResponse;
      if (!response.ok || !data.success || !data.event) {
        throw new Error(data.error || 'Failed to create calendar event');
      }

      const normalizedEvent = normalizeEvent(data.event);
      setEvents((previousEvents) => [...previousEvents, normalizedEvent]);
      return normalizedEvent;
    },
    [],
  );

  const updateEvent = useCallback(async (id: string, updates: Partial<Omit<CalendarEvent, 'id'>>) => {
    const response = await fetch(`/api/userdetails/calendar/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: updates.title,
        description: updates.description,
        date: updates.date,
        color: updates.color,
        reminderEnabled: updates.reminderEnabled,
        reminderOffsets: updates.reminderOffsets,
      }),
    });

    const data = (await response.json()) as CalendarResponse;
    if (!response.ok || !data.success || !data.event) {
      throw new Error(data.error || 'Failed to update calendar event');
    }

    const normalizedEvent = normalizeEvent(data.event);

    setEvents((previousEvents) =>
      previousEvents.map((event) => (event.id === id ? normalizedEvent : event)),
    );
  }, []);

  const deleteEvent = useCallback(async (id: string) => {
    const response = await fetch(`/api/userdetails/calendar/${id}`, {
      method: 'DELETE',
    });

    const data = (await response.json()) as CalendarResponse;
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to delete calendar event');
    }

    setEvents((previousEvents) => previousEvents.filter((event) => event.id !== id));
  }, []);

  const getEventsForDate = useCallback(
    (date: string): CalendarEvent[] => events.filter((event) => event.date === date),
    [events],
  );

  const sortedEvents = useMemo(
    () => [...events].sort((firstEvent, secondEvent) => firstEvent.date.localeCompare(secondEvent.date)),
    [events],
  );

  return {
    events: sortedEvents,
    addEvent,
    updateEvent,
    deleteEvent,
    getEventsForDate,
    refreshEvents: fetchEvents,
  };
};
