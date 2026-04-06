"use client";

import { useState, useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { LoaderCircle, X } from "lucide-react";

interface Event {
    title: string;
    date: string;
}

export default function Calendar({ isOpen }: { isOpen: boolean }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalDate, setModalDate] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDateClick = (info: any) => {
    setModalDate(info.dateStr);
    setNewTitle("");
    setShowModal(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleAddEvent = () => {
    if (newTitle.trim()) {
      setEvents([...events, { title: newTitle.trim(), date: modalDate }]);
    }
    setShowModal(false);
  };

  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
    }, 500);
  }, [isOpen]);

  return (
    <div className="relative">
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

      {/* Add Event Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-card rounded-xl shadow-lg dark:shadow-2xl dark:shadow-cyan-500/5 p-6 w-full max-w-sm mx-4 border dark:border-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-foreground">Add Event — {modalDate}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-muted rounded-md text-gray-600 dark:text-muted-foreground"><X size={18} /></button>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddEvent()}
              placeholder="Event title..."
              className="w-full px-3 py-2 border-2 border-gray-200 dark:border-border dark:bg-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sidebar-primary/30 focus:border-sidebar-primary mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-muted rounded-lg">Cancel</button>
              <button onClick={handleAddEvent} className="px-4 py-2 text-sm bg-sidebar-primary text-white rounded-lg hover:bg-sidebar-primary/90">Add Event</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
