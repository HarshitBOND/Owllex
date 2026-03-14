import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CalendarEvent } from './useCalendarEvents';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date | null;
  events: CalendarEvent[];
  onAddEvent: (event: Omit<CalendarEvent, 'id'>) => void;
  onDeleteEvent: (id: string) => void;
}

export const EventModal = ({
  isOpen,
  onClose,
  selectedDate,
  events,
  onAddEvent,
  onDeleteEvent,
}: EventModalProps) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setDescription('');
      setIsAdding(false);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !selectedDate) return;

    onAddEvent({
      title: title.trim(),
      description: description.trim() || undefined,
      date: format(selectedDate, 'yyyy-MM-dd'),
    });

    setTitle('');
    setDescription('');
    setIsAdding(false);
  };

  if (!selectedDate) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-x-2 bottom-0 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md z-50 max-h-[80vh] overflow-auto rounded-t-xl sm:rounded-xl"
          >
            <div className="bg-card rounded-t-xl sm:rounded-xl shadow-calendar border border-border p-4 sm:p-6 pb-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <CalendarIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-foreground">
                      {format(selectedDate, 'EEEE')}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {format(selectedDate, 'MMMM d, yyyy')}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8 hover:bg-secondary"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Events List */}
              <div className="space-y-3 mb-6">
                {events.length === 0 && !isAdding && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No events for this day
                  </p>
                )}
                {events.map((event) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className={cn(
                      "group flex items-start gap-3 p-3 rounded-lg",
                      event.isHearing
                        ? "bg-violet-50/80 dark:bg-violet-500/10 border border-violet-200/50 dark:border-violet-500/20"
                        : "bg-secondary/50"
                    )}
                  >
                    <div className={cn(
                      "w-1 h-full min-h-[40px] rounded-full",
                      event.isHearing ? "bg-violet-500" : "bg-primary"
                    )} />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-foreground truncate">
                        {event.isHearing ? '⚖️ ' : ''}{event.title}
                      </h4>
                      {event.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {event.description}
                        </p>
                      )}
                    </div>
                    {!event.isHearing ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteEvent(event.id)}
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="text-[10px] text-violet-500 font-medium px-1.5 py-0.5 bg-violet-100 dark:bg-violet-500/20 rounded">Hearing</span>
                    )}
                  </motion.div>
                ))}
              </div>

              {/* Add Event Form */}
              <AnimatePresence mode="wait">
                {isAdding ? (
                  <motion.form
                    key="form"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    onSubmit={handleSubmit}
                    className="space-y-4 overflow-hidden"
                  >
                    <Input
                      placeholder="Event title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="bg-secondary/10 border-border focus:border-primary"
                      autoFocus
                    />
                    <Textarea
                      placeholder="Description (optional)"
                      value={description}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                      rows={3}
                      className="bg-secondary/10 border-border focus:border-primary resize-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsAdding(false)}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={!title.trim()}
                        className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        Save Event
                      </Button>
                    </div>
                  </motion.form>
                ) : (
                  <motion.div key="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <Button
                      onClick={() => setIsAdding(true)}
                      variant="outline"
                      className="w-full border-dashed border-2 hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Event
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
