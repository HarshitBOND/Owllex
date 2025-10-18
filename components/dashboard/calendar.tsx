"use client";

import { useState, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { LoaderCircle } from "lucide-react";

interface Event {
    title: string;
    date: string;
}

export default function Calendar({ isOpen }: { isOpen: boolean }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
    }, 500);
  }, [isOpen]);

  return (
    <div>
      {loading ? (
        <div className="h-100 flex items-center justify-center gap-x-1">
          <LoaderCircle className="text-gray-500 animate-spin" size={18} />
          <p className="text-center text-gray-500">Loading...</p>
        </div>
      ) : (
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          events={events}
          dateClick={handleDateClick}
          height={isOpen ? "67.3vh" : "61vh"}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,dayGridWeek,dayGridDay",
        }}
      />
      )}
    </div>
  );
}
