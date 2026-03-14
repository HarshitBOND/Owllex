import React from 'react';
import { motion } from 'framer-motion';
import { 
  Settings, 
  Archive, 
  Trash2,
  VolumeX,
  Volume2,
  Zap,
  ZapOff,
} from 'lucide-react';
import { TaskSettings } from '../types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TaskSettingsPanelProps {
  settings: TaskSettings;
  setSettings: (settings: TaskSettings) => void;
  onArchiveCompleted: () => void;
  onDeleteCompleted: () => void;
  onUndo: () => void;
  canUndo: boolean;
  completedCount: number;
}

export const TaskSettingsPanel: React.FC<TaskSettingsPanelProps> = ({
  settings,
  setSettings,
  onArchiveCompleted,
  onDeleteCompleted,
  onUndo,
  canUndo,
  completedCount,
}) => {
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="w-9 h-9">
            <Settings className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2 py-2 font-semibold text-sm">Settings</div>
          <div className="border-t" />

          <div className="px-2 py-2 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs cursor-pointer flex items-center gap-2">
                {settings.soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                Sound
              </label>
              <input
                type="checkbox"
                checked={settings.soundEnabled}
                onChange={(e) => setSettings({ ...settings, soundEnabled: e.target.checked })}
                className="w-4 h-4"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs cursor-pointer flex items-center gap-2">
                {settings.confettiEnabled ? <Zap className="w-3.5 h-3.5" /> : <ZapOff className="w-3.5 h-3.5" />}
                Confetti
              </label>
              <input
                type="checkbox"
                checked={settings.confettiEnabled}
                onChange={(e) => setSettings({ ...settings, confettiEnabled: e.target.checked })}
                className="w-4 h-4"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs cursor-pointer">
                Show Subtasks
              </label>
              <input
                type="checkbox"
                checked={settings.showSubtasks}
                onChange={(e) => setSettings({ ...settings, showSubtasks: e.target.checked })}
                className="w-4 h-4"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs cursor-pointer">
                Show Timer
              </label>
              <input
                type="checkbox"
                checked={settings.showTimer}
                onChange={(e) => setSettings({ ...settings, showTimer: e.target.checked })}
                className="w-4 h-4"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs cursor-pointer">
                Compact Mode
              </label>
              <input
                type="checkbox"
                checked={settings.compactMode}
                onChange={(e) => setSettings({ ...settings, compactMode: e.target.checked })}
                className="w-4 h-4"
              />
            </div>
          </div>

          <div className="border-t" />

          <div className="px-2 py-2 space-y-1">
            <button
              onClick={onArchiveCompleted}
              disabled={completedCount === 0}
              className="w-full text-left text-xs px-2 py-1.5 rounded-md border border-border/70 bg-background/70 shadow-sm shadow-primary/5 backdrop-blur-sm transition-all duration-200 hover:bg-accent hover:shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Archive className="w-3.5 h-3.5" />
              Archive Completed ({completedCount})
            </button>

            <button
              onClick={() => setShowDeleteDialog(true)}
              disabled={completedCount === 0}
              className="w-full text-left text-xs px-2 py-1.5 rounded-md border border-destructive/30 bg-background/70 shadow-sm shadow-primary/5 backdrop-blur-sm transition-all duration-200 hover:bg-destructive/10 hover:shadow-md text-destructive flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Completed
            </button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border rounded-lg p-6 max-w-sm">
            <h2 className="text-lg font-bold mb-2">Delete completed tasks?</h2>
            <p className="text-sm text-muted-foreground mb-4">
              This will permanently delete {completedCount} completed task(s). This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  onDeleteCompleted();
                  setShowDeleteDialog(false);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
