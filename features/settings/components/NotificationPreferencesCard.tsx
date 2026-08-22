import { BellRing, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { NoticeState, NotificationPreferencesState } from "../types"
import { formatHour, hourOptions } from "../utils"
import { NoticeBanner } from "./NoticeBanner"

interface NotificationPreferencesCardProps {
  notificationPreferences: NotificationPreferencesState
  setNotificationPreferences: React.Dispatch<React.SetStateAction<NotificationPreferencesState>>
  notice: NoticeState
  saving: boolean
  onSave: () => void
  onReminderToggle: (offset: number) => void
}

export function NotificationPreferencesCard({
  notificationPreferences,
  setNotificationPreferences,
  notice,
  saving,
  onSave,
  onReminderToggle,
}: NotificationPreferencesCardProps) {
  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <BellRing className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        <h3 className="font-semibold text-gray-900 dark:text-foreground">Notification Preferences</h3>
      </div>
      <p className="text-xs text-gray-500 dark:text-muted-foreground mb-4">Set timezone, send window, and reminder offsets.</p>

      <NoticeBanner notice={notice} />

      <div className="grid lg:grid-cols-4 gap-3">
        <label className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-border px-3 h-10 text-sm text-gray-700 dark:text-foreground lg:col-span-1">
          <input
            type="checkbox"
            checked={notificationPreferences.emailEnabled}
            onChange={(event) =>
              setNotificationPreferences((previous) => ({
                ...previous,
                emailEnabled: event.target.checked,
              }))
            }
          />
          Email reminders enabled
        </label>

        <Input
          value={notificationPreferences.timezone}
          onChange={(event) =>
            setNotificationPreferences((previous) => ({
              ...previous,
              timezone: event.target.value,
            }))
          }
          placeholder="Timezone (e.g. Asia/Kolkata)"
          className="lg:col-span-3"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-3 mt-3">
        <select
          value={notificationPreferences.sendWindowStartHour}
          onChange={(event) =>
            setNotificationPreferences((previous) => ({
              ...previous,
              sendWindowStartHour: Number(event.target.value),
            }))
          }
          className="h-10 rounded-md border border-gray-200 dark:border-border bg-white dark:bg-input px-3 text-sm dark:text-foreground"
        >
          {hourOptions.map((hour) => (
            <option key={`start-${hour}`} value={hour}>
              Send window start: {formatHour(hour)}
            </option>
          ))}
        </select>

        <select
          value={notificationPreferences.sendWindowEndHour}
          onChange={(event) =>
            setNotificationPreferences((previous) => ({
              ...previous,
              sendWindowEndHour: Number(event.target.value),
            }))
          }
          className="h-10 rounded-md border border-gray-200 dark:border-border bg-white dark:bg-input px-3 text-sm dark:text-foreground"
        >
          {hourOptions
            .map((hour) => hour + 1)
            .filter((hour) => hour >= 1 && hour <= 24)
            .map((hour) => (
              <option key={`end-${hour}`} value={hour}>
                Send window end: {formatHour(hour % 24)}
              </option>
            ))}
        </select>
      </div>

      <div className="mt-3">
        <p className="text-xs text-gray-500 dark:text-muted-foreground mb-2">Reminder offsets</p>
        <div className="flex flex-wrap gap-2">
          {[7, 3, 1].map((offset) => {
            const isActive = notificationPreferences.reminderOffsets.includes(offset)
            return (
              <button
                key={offset}
                type="button"
                onClick={() => onReminderToggle(offset)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs border",
                  isActive
                    ? "bg-sidebar-primary text-white border-sidebar-primary"
                    : "bg-white dark:bg-input text-gray-600 dark:text-foreground border-gray-200 dark:border-border",
                )}
              >
                {offset} day{offset === 1 ? "" : "s"} before
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex justify-end mt-4">
        <Button onClick={onSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Notification Preferences"
          )}
        </Button>
      </div>
    </div>
  )
}
