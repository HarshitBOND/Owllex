"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { NoticeState, NotificationPreferencesState } from "../types"
import { formatHour, hourOptions } from "../utils"
import { NoticeBanner } from "./NoticeBanner"
import { PanelHeader, Row, RowGroup, Select, Toggle } from "./SettingsPrimitives"

interface NotificationsPanelProps {
  notificationPreferences: NotificationPreferencesState
  setNotificationPreferences: React.Dispatch<React.SetStateAction<NotificationPreferencesState>>
  notice: NoticeState
  saving: boolean
  onSave: () => void
  onReminderToggle: (offset: number) => void
}

export function NotificationsPanel({
  notificationPreferences,
  setNotificationPreferences,
  notice,
  saving,
  onSave,
  onReminderToggle,
}: NotificationsPanelProps) {
  const update = <K extends keyof NotificationPreferencesState>(
    key: K,
    value: NotificationPreferencesState[K],
  ) => setNotificationPreferences((previous) => ({ ...previous, [key]: value }))

  return (
    <>
      <PanelHeader title="Notifications" description="When and how the app reaches you about hearings and tasks." />

      <RowGroup title="Delivery">
        <Row label="Email reminders" hint="Hearing and task reminders sent to your inbox.">
          <Toggle
            label="Email reminders enabled"
            checked={notificationPreferences.emailEnabled}
            onChange={(next) => update("emailEnabled", next)}
          />
        </Row>

        <Row label="Timezone" hint="Reminder times are calculated in this zone.">
          <Input
            value={notificationPreferences.timezone}
            onChange={(event) => update("timezone", event.target.value)}
            placeholder="Asia/Kolkata"
            className="h-9 w-full sm:w-[260px] text-[13px]"
          />
        </Row>

        <Row label="Send window starts" hint="No reminders are sent before this hour.">
          <Select
            value={String(notificationPreferences.sendWindowStartHour)}
            onChange={(value) => update("sendWindowStartHour", Number(value))}
            options={hourOptions.map((hour) => ({ value: String(hour), label: formatHour(hour) }))}
          />
        </Row>

        <Row label="Send window ends" hint="No reminders are sent after this hour.">
          <Select
            value={String(notificationPreferences.sendWindowEndHour)}
            onChange={(value) => update("sendWindowEndHour", Number(value))}
            options={hourOptions
              .map((hour) => hour + 1)
              .filter((hour) => hour >= 1 && hour <= 24)
              .map((hour) => ({ value: String(hour), label: formatHour(hour % 24) }))}
          />
        </Row>
      </RowGroup>

      <RowGroup title="Reminder schedule">
        <Row label="Remind me before a hearing" hint="Pick up to three lead times." align="start">
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {[7, 3, 1].map((offset) => {
              const isActive = notificationPreferences.reminderOffsets.includes(offset)
              return (
                <button
                  key={offset}
                  type="button"
                  onClick={() => onReminderToggle(offset)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[12px] border transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-white dark:bg-input text-gray-600 dark:text-foreground border-gray-200 dark:border-border hover:border-gray-300",
                  )}
                >
                  {offset} day{offset === 1 ? "" : "s"} before
                </button>
              )
            })}
          </div>
        </Row>
      </RowGroup>

      <div className="mt-5">
        <NoticeBanner notice={notice} />
        <Button onClick={onSave} disabled={saving} size="sm">
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
              Saving
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </>
  )
}
