import type { AccountSettingsState, NotificationPreferencesState } from "./types"

export const defaultAccountState: AccountSettingsState = {
  firstName: "",
  lastName: "",
  email: "",
  defaultLandingPage: "/dashboard",
  weeklyDigestEnabled: false,
  showBillingSummary: true,
}

export const defaultNotificationState: NotificationPreferencesState = {
  emailEnabled: true,
  timezone: "Asia/Kolkata",
  sendWindowStartHour: 8,
  sendWindowEndHour: 20,
  reminderOffsets: [7, 3, 1],
}

export const hourOptions = Array.from({ length: 24 }, (_, index) => index)

export function formatHour(value: number) {
  const suffix = value >= 12 ? "PM" : "AM"
  const normalized = value % 12 === 0 ? 12 : value % 12
  return `${normalized}:00 ${suffix}`
}

export function formatAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 2,
    }).format(Number(amount || 0))
  } catch {
    return `${currency || "INR"} ${Number(amount || 0).toFixed(2)}`
  }
}

export function formatDateValue(dateValue?: string | null) {
  if (!dateValue) return "—"

  return new Date(dateValue).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
