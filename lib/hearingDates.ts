const DAY_IN_MS = 24 * 60 * 60 * 1000

export const REMINDER_WINDOWS = [7, 3, 1] as const

export type ReminderWindowDays = (typeof REMINDER_WINDOWS)[number]

const isValidDate = (value: Date) => !Number.isNaN(value.getTime())

export function parseCourtDate(dateValue?: string | null): Date | null {
  if (!dateValue) {
    return null
  }

  const trimmedDate = dateValue.trim()
  if (!trimmedDate) {
    return null
  }

  const isoDateOnlyMatch = trimmedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoDateOnlyMatch) {
    const [, year, month, day] = isoDateOnlyMatch
    const parsedDate = new Date(Number(year), Number(month) - 1, Number(day))
    return isValidDate(parsedDate) ? parsedDate : null
  }

  const parts = trimmedDate.split(/[.\/-]/)
  if (parts.length === 3 && parts.every((part) => /^\d+$/.test(part))) {
    const [first, second, third] = parts

    if (first.length === 4) {
      const parsedDate = new Date(Number(first), Number(second) - 1, Number(third))
      return isValidDate(parsedDate) ? parsedDate : null
    }

    const parsedDate = new Date(Number(third), Number(second) - 1, Number(first))
    return isValidDate(parsedDate) ? parsedDate : null
  }

  const parsedDate = new Date(trimmedDate)
  if (!isValidDate(parsedDate)) {
    return null
  }

  return new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate())
}

export function parseStoredHearingDate(dateValue?: string | null): Date | null {
  return parseCourtDate(dateValue)
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function getDaysUntilDate(targetDate: Date, baseDate: Date = new Date()): number {
  const diffInMs = startOfDay(targetDate).getTime() - startOfDay(baseDate).getTime()
  return Math.round(diffInMs / DAY_IN_MS)
}

export function isReminderWindow(daysUntil: number): daysUntil is ReminderWindowDays {
  return REMINDER_WINDOWS.includes(daysUntil as ReminderWindowDays)
}

export function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

export function toClientDateTimeIso(date: Date): string {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)).toISOString()
}

export function formatDisplayDate(dateValue?: string | Date | null): string {
  const parsedDate = dateValue instanceof Date ? dateValue : parseStoredHearingDate(dateValue)

  if (!parsedDate) {
    return "Invalid date"
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsedDate)
}

export function formatReminderWindow(days: ReminderWindowDays | number): string {
  return `${days} day${days === 1 ? "" : "s"}`
}