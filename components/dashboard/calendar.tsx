"use client";

import { useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";

interface Event {
    title: string;
    date: string;
}

export default function Calendar() {
  const [events, setEvents] = useState<Event[]>([]);

  const handleDateClick = (info: any) => {
    const event = events.find((event) => event.date === info.dateStr);
    if (event) {
      alert(`Event on ${info.dateStr}: ${event.title}`);
    }
    const title = prompt("Enter an event title:");
    if (title) {
      setEvents([...events, { title, date: info.dateStr }]);
    }
  };

  return (
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        events={events}
        dateClick={handleDateClick}
        height="60vh"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,dayGridWeek,dayGridDay",
        }}
      />
  );
}
