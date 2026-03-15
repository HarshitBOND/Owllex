import sgMail from "@sendgrid/mail"
import { clerkClient } from "@clerk/nextjs/server"
import CalendarEvent from "@/app/api/lib/models/calendar-event"
import Notification from "@/app/api/lib/models/notification"
import User from "@/app/api/lib/models/user"
import {
  formatDateKey,
  formatDisplayDate,
  formatReminderWindow,
  getDaysUntilDate,
  isReminderWindow,
  parseCourtDate,
  REMINDER_WINDOWS,
  ReminderWindowDays,
} from "@/lib/hearingDates"

type SerializableId = { toString(): string } | string

type NotificationStatus = "pending" | "sent" | "failed"
type NotificationType = "hearing-reminder" | "calendar-event-reminder"
type NotificationResourceType = "case" | "task" | "calendar-event"

type NotificationPreferencesDocument = {
  emailEnabled?: boolean | null
  timezone?: string | null
  sendWindowStartHour?: number | null
  sendWindowEndHour?: number | null
  reminderOffsets?: unknown
}

type CaseSummary = {
  _id: SerializableId
  caseNo?: string | null
  caseTitle?: string | null
  courtDate?: string | null
  courtName?: string | null
}

type UserWithCases = {
  clerkUid: string
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  notificationPreferences?: NotificationPreferencesDocument | null
  cases?: CaseSummary[]
}

type CalendarEventSummary = {
  _id: SerializableId
  clerkUid: string
  title: string
  description?: string | null
  date: string
  sourceType: "manual" | "task" | "hearing"
  caseId?: SerializableId | null
  reminderEnabled?: boolean
  reminderOffsets?: number[]
}

type NotificationDocument = {
  _id: SerializableId
  clerkUid: string
  type: NotificationType
  title: string
  message: string
  caseId?: SerializableId | null
  calendarEventId?: SerializableId | null
  caseTitle: string
  hearingDate: string
  reminderWindowDays: ReminderWindowDays
  resourceType?: NotificationResourceType | null
  resourceUrl?: string | null
  channel: "email"
  status: NotificationStatus
  retryCount?: number | null
  lastAttemptAt?: Date | string | null
  nextRetryAt?: Date | string | null
  sentAt?: Date | string | null
  readAt?: Date | string | null
  emailTo?: string | null
  error?: string | null
  createdAt?: Date | string
  updatedAt?: Date | string
}

export type NotificationPreferences = {
  emailEnabled: boolean
  timezone: string
  sendWindowStartHour: number
  sendWindowEndHour: number
  reminderOffsets: ReminderWindowDays[]
}

export type NotificationPreferenceUpdateInput = Partial<NotificationPreferences>

export type SerializedNotification = {
  _id: string
  clerkUid: string
  type: NotificationType
  title: string
  message: string
  caseId: string | null
  calendarEventId: string | null
  caseTitle: string
  hearingDate: string
  reminderWindowDays: ReminderWindowDays
  resourceType: NotificationResourceType | null
  resourceUrl: string | null
  channel: "email"
  status: NotificationStatus
  sentAt: string | null
  readAt: string | null
  emailTo: string | null
  error: string | null
  isRead: boolean
  createdAt: string | null
  updatedAt: string | null
}

export type NotificationListResult = {
  notifications: SerializedNotification[]
  unreadCount: number
}

export type ReminderGenerationSummary = {
  usersScanned: number
  casesScanned: number
  eligibleHearings: number
  invalidCourtDates: number
  notificationsPrepared: number
  notificationsCreated: number
  duplicatesSkipped: number
}

export type CalendarReminderGenerationSummary = {
  calendarEventsScanned: number
  eligibleCalendarReminders: number
  calendarNotificationsPrepared: number
  calendarNotificationsCreated: number
  calendarDuplicatesSkipped: number
}

export type ReminderDeliverySummary = {
  deliveryEnabled: boolean
  pendingFound: number
  attempted: number
  sent: number
  failed: number
  skipped: number
}

export type NotificationReconciliationSummary = {
  pendingRemoved: number
  failedRemoved: number
  totalRemoved: number
}

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  emailEnabled: true,
  timezone: "Asia/Kolkata",
  sendWindowStartHour: 8,
  sendWindowEndHour: 20,
  reminderOffsets: [...REMINDER_WINDOWS],
}

const MAX_NOTIFICATION_RETRIES = Math.max(1, Number(process.env.NOTIFICATION_MAX_RETRIES || 3))
const RETRY_BACKOFF_MINUTES = [15, 60, 240, 720]

const getStringId = (value?: SerializableId | null) => (value ? value.toString() : null)

const parseDateValue = (value?: Date | string | null) => {
  if (!value) {
    return null
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return null
  }

  return parsedDate
}

const toIsoString = (value?: Date | string | null) => {
  const parsedDate = parseDateValue(value)
  return parsedDate ? parsedDate.toISOString() : null
}

const clampHour = (value: unknown, fallback: number, min: number, max: number) => {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.trunc(numericValue)))
}

const isValidTimezone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

const sanitizeReminderOffsets = (offsets: unknown): ReminderWindowDays[] => {
  if (!Array.isArray(offsets)) {
    return []
  }

  return [...new Set(
    offsets
      .map((value) => Number(value))
      .filter((value): value is ReminderWindowDays => Number.isFinite(value) && isReminderWindow(value)),
  )].sort((left, right) => right - left)
}

const normalizeReminderOffsets = (
  offsets: unknown,
  fallback: ReminderWindowDays[] = DEFAULT_NOTIFICATION_PREFERENCES.reminderOffsets,
) => {
  const parsedOffsets = sanitizeReminderOffsets(offsets)
  return parsedOffsets.length > 0 ? parsedOffsets : [...fallback]
}

const normalizeNotificationPreferences = (
  value?: NotificationPreferencesDocument | Partial<NotificationPreferences> | null,
): NotificationPreferences => {
  const timezoneCandidate = typeof value?.timezone === "string" ? value.timezone.trim() : ""
  const timezone = timezoneCandidate && isValidTimezone(timezoneCandidate)
    ? timezoneCandidate
    : DEFAULT_NOTIFICATION_PREFERENCES.timezone

  const sendWindowStartHour = clampHour(
    value?.sendWindowStartHour,
    DEFAULT_NOTIFICATION_PREFERENCES.sendWindowStartHour,
    0,
    23,
  )

  let sendWindowEndHour = clampHour(
    value?.sendWindowEndHour,
    DEFAULT_NOTIFICATION_PREFERENCES.sendWindowEndHour,
    1,
    24,
  )

  if (sendWindowEndHour === sendWindowStartHour) {
    sendWindowEndHour = sendWindowStartHour === 23 ? 24 : sendWindowStartHour + 1
  }

  return {
    emailEnabled:
      typeof value?.emailEnabled === "boolean"
        ? value.emailEnabled
        : DEFAULT_NOTIFICATION_PREFERENCES.emailEnabled,
    timezone,
    sendWindowStartHour,
    sendWindowEndHour,
    reminderOffsets: normalizeReminderOffsets(value?.reminderOffsets),
  }
}

const getCurrentHourInTimezone = (timezone: string, referenceDate = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(referenceDate)

  const hourPart = parts.find((part) => part.type === "hour")
  const parsedHour = Number(hourPart?.value)
  return Number.isFinite(parsedHour) ? parsedHour : 0
}

const isWithinSendWindow = (
  hour: number,
  preferences: Pick<NotificationPreferences, "sendWindowStartHour" | "sendWindowEndHour">,
) => {
  const { sendWindowStartHour, sendWindowEndHour } = preferences

  if (sendWindowStartHour < sendWindowEndHour) {
    return hour >= sendWindowStartHour && hour < sendWindowEndHour
  }

  return hour >= sendWindowStartHour || hour < sendWindowEndHour
}

const getHoursUntilWindowStart = (
  hour: number,
  preferences: Pick<NotificationPreferences, "sendWindowStartHour" | "sendWindowEndHour">,
) => {
  const { sendWindowStartHour, sendWindowEndHour } = preferences

  if (isWithinSendWindow(hour, preferences)) {
    return 0
  }

  if (sendWindowStartHour < sendWindowEndHour) {
    if (hour < sendWindowStartHour) {
      return sendWindowStartHour - hour
    }

    return 24 - hour + sendWindowStartHour
  }

  return sendWindowStartHour - hour
}

const getDeferredSendDate = (preferences: NotificationPreferences, referenceDate: Date) => {
  const localHour = getCurrentHourInTimezone(preferences.timezone, referenceDate)
  const hoursUntilWindow = getHoursUntilWindowStart(localHour, preferences)
  const safeHoursUntilWindow = Math.max(hoursUntilWindow, 1)

  return new Date(referenceDate.getTime() + safeHoursUntilWindow * 60 * 60 * 1000)
}

const getRetryCount = (notification: NotificationDocument) => {
  const parsedCount = Number(notification.retryCount)
  return Number.isFinite(parsedCount) && parsedCount >= 0 ? Math.trunc(parsedCount) : 0
}

const getRetryDelayMinutes = (retryCount: number) => {
  const safeRetryCount = Math.max(1, retryCount)
  return RETRY_BACKOFF_MINUTES[Math.min(safeRetryCount - 1, RETRY_BACKOFF_MINUTES.length - 1)]
}

const getRetryDate = (retryCount: number, referenceDate: Date) =>
  new Date(referenceDate.getTime() + getRetryDelayMinutes(retryCount) * 60 * 1000)

const isReadyForDelivery = (notification: NotificationDocument, now: Date) => {
  const nextRetryAt = parseDateValue(notification.nextRetryAt)

  if (!nextRetryAt) {
    return true
  }

  return nextRetryAt.getTime() <= now.getTime()
}

const shouldAttemptDelivery = (notification: NotificationDocument, now: Date) => {
  if (!isReadyForDelivery(notification, now)) {
    return false
  }

  if (notification.status === "pending") {
    return true
  }

  if (notification.status !== "failed") {
    return false
  }

  return getRetryCount(notification) < MAX_NOTIFICATION_RETRIES
}

const compareNotificationsForDelivery = (left: NotificationDocument, right: NotificationDocument) => {
  const leftDate = parseDateValue(left.createdAt)?.getTime() || 0
  const rightDate = parseDateValue(right.createdAt)?.getTime() || 0

  if (leftDate === rightDate) {
    const leftId = getStringId(left._id) || ""
    const rightId = getStringId(right._id) || ""
    return leftId.localeCompare(rightId)
  }

  return leftDate - rightDate
}

const buildRelativeCaseUrl = (caseId: string) => `/case-tracking/view/${caseId}`

const buildAbsoluteAppUrl = (pathOrUrl?: string | null) => {
  if (!pathOrUrl) {
    return null
  }

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "")
  if (!baseUrl) {
    return null
  }

  return `${baseUrl}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`
}

const getCaseLabel = (caseRecord: CaseSummary) =>
  caseRecord.caseTitle?.trim() || caseRecord.caseNo?.trim() || "Untitled case"

const buildHearingNotificationTitle = (caseRecord: CaseSummary, reminderWindowDays: ReminderWindowDays) =>
  `Hearing in ${formatReminderWindow(reminderWindowDays)}: ${getCaseLabel(caseRecord)}`

const buildHearingNotificationMessage = (
  caseRecord: CaseSummary,
  hearingDate: string,
  reminderWindowDays: ReminderWindowDays,
) => {
  const courtSuffix = caseRecord.courtName?.trim() ? ` at ${caseRecord.courtName.trim()}` : ""
  return `${getCaseLabel(caseRecord)} has a hearing scheduled for ${formatDisplayDate(hearingDate)}${courtSuffix}. Reminder window: ${formatReminderWindow(reminderWindowDays)}.`
}

const buildCalendarReminderTitle = (eventTitle: string, reminderWindowDays: ReminderWindowDays) =>
  `Event in ${formatReminderWindow(reminderWindowDays)}: ${eventTitle}`

const buildCalendarReminderMessage = (
  event: CalendarEventSummary,
  eventDate: string,
  reminderWindowDays: ReminderWindowDays,
) => {
  const sourceLabel = event.sourceType === "task" ? "Task" : "Event"
  return `${sourceLabel} ${event.title} is scheduled for ${formatDisplayDate(eventDate)}. Reminder window: ${formatReminderWindow(reminderWindowDays)}.`
}

const buildHearingNotificationDedupeKey = ({
  clerkUid,
  caseId,
  hearingDate,
  reminderWindowDays,
}: {
  clerkUid: string
  caseId: string
  hearingDate: string
  reminderWindowDays: ReminderWindowDays
}) => [clerkUid, caseId, hearingDate, reminderWindowDays, "hearing", "email"].join("::")

const buildCalendarEventNotificationDedupeKey = ({
  clerkUid,
  calendarEventId,
  eventDate,
  reminderWindowDays,
}: {
  clerkUid: string
  calendarEventId: string
  eventDate: string
  reminderWindowDays: ReminderWindowDays
}) => [clerkUid, calendarEventId, eventDate, reminderWindowDays, "calendar", "email"].join("::")

const buildCalendarEventResourceUrl = (event: CalendarEventSummary) => {
  if (event.sourceType === "task") {
    return "/tasks"
  }

  return "/dashboard"
}

const buildNotificationResourceUrl = (notification: NotificationDocument) => {
  if (notification.resourceUrl) {
    return buildAbsoluteAppUrl(notification.resourceUrl)
  }

  const caseId = getStringId(notification.caseId)
  if (caseId) {
    return buildAbsoluteAppUrl(buildRelativeCaseUrl(caseId))
  }

  return null
}

const buildEmailSubject = (notification: NotificationDocument) =>
  notification.type === "calendar-event-reminder"
    ? `Upcoming event in ${formatReminderWindow(notification.reminderWindowDays)}: ${notification.caseTitle}`
    : `Upcoming hearing in ${formatReminderWindow(notification.reminderWindowDays)}: ${notification.caseTitle}`

const buildEmailText = (notification: NotificationDocument) => {
  const reminderLabel = notification.type === "calendar-event-reminder" ? "Event" : "Hearing"
  const lines = [
    "Hello,",
    "",
    `This is a LexVert reminder for ${notification.caseTitle}.`,
    `${reminderLabel} date: ${formatDisplayDate(notification.hearingDate)}`,
    `Reminder window: ${formatReminderWindow(notification.reminderWindowDays)}`,
    notification.message,
  ]

  const resourceUrl = buildNotificationResourceUrl(notification)
  if (resourceUrl) {
    lines.push(`Open in LexVert: ${resourceUrl}`)
  }

  lines.push("", "Regards,", "LexVert")

  return lines.join("\n")
}

const getSendGridConfig = () => {
  const apiKey = process.env.SENDGRID_API_KEY?.trim() || ""
  const fromEmail = process.env.NOTIFICATION_FROM_EMAIL?.trim() || ""
  const fromName = process.env.NOTIFICATION_FROM_NAME?.trim() || "LexVert"

  return {
    apiKey,
    fromEmail,
    fromName,
    isEnabled: Boolean(apiKey && fromEmail),
  }
}

const extractErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return "Unknown notification delivery error"
}

const getPreferredReminderOffsets = (user: UserWithCases) =>
  normalizeNotificationPreferences(user.notificationPreferences).reminderOffsets

async function resolveUserEmail(clerkUid: string, fallbackEmail?: string | null) {
  if (fallbackEmail) {
    return fallbackEmail
  }

  const user = await User.findOne({ clerkUid }).select("email").lean().exec()
  if (user?.email) {
    return user.email
  }

  try {
    const client = await clerkClient()
    const clerkUser = await client.users.getUser(clerkUid)
    const emailAddress = clerkUser.emailAddresses?.[0]?.emailAddress || null

    if (emailAddress) {
      await User.updateOne({ clerkUid }, { $set: { email: emailAddress } }).exec()
    }

    return emailAddress
  } catch (error) {
    console.error("Failed to resolve notification email from Clerk:", error)
    return null
  }
}

export async function getNotificationPreferences(clerkUid: string): Promise<NotificationPreferences> {
  const user = (await User.findOne({ clerkUid })
    .select("notificationPreferences")
    .lean()
    .exec()) as { notificationPreferences?: NotificationPreferencesDocument | null } | null

  return normalizeNotificationPreferences(user?.notificationPreferences || null)
}

export async function updateNotificationPreferences(
  clerkUid: string,
  updates: NotificationPreferenceUpdateInput,
): Promise<NotificationPreferences> {
  const currentPreferences = await getNotificationPreferences(clerkUid)

  const normalizedPreferences = normalizeNotificationPreferences({
    ...currentPreferences,
    ...updates,
  })

  await User.updateOne(
    { clerkUid },
    {
      $set: {
        notificationPreferences: normalizedPreferences,
      },
    },
  ).exec()

  return normalizedPreferences
}

export function serializeNotification(notification: NotificationDocument): SerializedNotification {
  return {
    _id: getStringId(notification._id) || "",
    clerkUid: notification.clerkUid,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    caseId: getStringId(notification.caseId),
    calendarEventId: getStringId(notification.calendarEventId),
    caseTitle: notification.caseTitle,
    hearingDate: notification.hearingDate,
    reminderWindowDays: notification.reminderWindowDays,
    resourceType: notification.resourceType || null,
    resourceUrl: notification.resourceUrl || null,
    channel: notification.channel,
    status: notification.status,
    sentAt: toIsoString(notification.sentAt),
    readAt: toIsoString(notification.readAt),
    emailTo: notification.emailTo || null,
    error: notification.error || null,
    isRead: Boolean(notification.readAt),
    createdAt: toIsoString(notification.createdAt),
    updatedAt: toIsoString(notification.updatedAt),
  }
}

export async function listNotificationsForUser(clerkUid: string, limit = 8): Promise<NotificationListResult> {
  const safeLimit = Math.max(1, Math.min(limit, 50))

  const [notifications, unreadCount] = await Promise.all([
    Notification.find({ clerkUid }).sort({ createdAt: -1 }).limit(safeLimit).lean().exec(),
    Notification.countDocuments({ clerkUid, readAt: null }),
  ])

  return {
    notifications: notifications.map((notification) => serializeNotification(notification as NotificationDocument)),
    unreadCount,
  }
}

export async function markNotificationAsRead(clerkUid: string, notificationId: string) {
  const readAt = new Date()
  const updateResult = await Notification.updateOne(
    { _id: notificationId, clerkUid, readAt: null },
    { $set: { readAt } },
  ).exec()

  if (updateResult.matchedCount > 0) {
    return { found: true, markedCount: updateResult.modifiedCount }
  }

  const existingNotification = await Notification.exists({ _id: notificationId, clerkUid })

  return {
    found: Boolean(existingNotification),
    markedCount: 0,
  }
}

export async function markAllNotificationsAsRead(clerkUid: string) {
  const readAt = new Date()

  const updateResult = await Notification.updateMany(
    { clerkUid, readAt: null },
    { $set: { readAt } },
  ).exec()

  return {
    markedCount: updateResult.modifiedCount,
  }
}

export async function generateHearingReminderNotifications(
  users: UserWithCases[],
): Promise<ReminderGenerationSummary> {
  let casesScanned = 0
  let eligibleHearings = 0
  let invalidCourtDates = 0

  const operations = []

  for (const user of users) {
    const preferredReminderOffsets = new Set(getPreferredReminderOffsets(user))
    const userCases = Array.isArray(user.cases) ? user.cases : []
    casesScanned += userCases.length

    for (const caseRecord of userCases) {
      if (!caseRecord?._id || !caseRecord.courtDate) {
        continue
      }

      const hearingDate = parseCourtDate(caseRecord.courtDate)
      if (!hearingDate) {
        invalidCourtDates += 1
        continue
      }

      const daysUntilHearing = getDaysUntilDate(hearingDate)
      if (!isReminderWindow(daysUntilHearing)) {
        continue
      }

      if (!preferredReminderOffsets.has(daysUntilHearing as ReminderWindowDays)) {
        continue
      }

      eligibleHearings += 1

      const normalizedHearingDate = formatDateKey(hearingDate)
      const caseId = getStringId(caseRecord._id)
      if (!caseId) {
        continue
      }

      const dedupeKey = buildHearingNotificationDedupeKey({
        clerkUid: user.clerkUid,
        caseId,
        hearingDate: normalizedHearingDate,
        reminderWindowDays: daysUntilHearing,
      })

      operations.push({
        updateOne: {
          filter: { dedupeKey },
          update: {
            $setOnInsert: {
              clerkUid: user.clerkUid,
              type: "hearing-reminder",
              title: buildHearingNotificationTitle(caseRecord, daysUntilHearing),
              message: buildHearingNotificationMessage(caseRecord, normalizedHearingDate, daysUntilHearing),
              caseId,
              calendarEventId: null,
              caseTitle: getCaseLabel(caseRecord),
              hearingDate: normalizedHearingDate,
              reminderWindowDays: daysUntilHearing,
              resourceType: "case",
              resourceUrl: buildRelativeCaseUrl(caseId),
              channel: "email",
              status: "pending",
              retryCount: 0,
              lastAttemptAt: null,
              nextRetryAt: null,
              sentAt: null,
              readAt: null,
              emailTo: user.email || null,
              error: null,
              dedupeKey,
            },
          },
          upsert: true,
        },
      })
    }
  }

  if (operations.length === 0) {
    return {
      usersScanned: users.length,
      casesScanned,
      eligibleHearings,
      invalidCourtDates,
      notificationsPrepared: 0,
      notificationsCreated: 0,
      duplicatesSkipped: 0,
    }
  }

  const writeResult = await Notification.bulkWrite(operations, { ordered: false })

  return {
    usersScanned: users.length,
    casesScanned,
    eligibleHearings,
    invalidCourtDates,
    notificationsPrepared: operations.length,
    notificationsCreated: writeResult.upsertedCount,
    duplicatesSkipped: Math.max(operations.length - writeResult.upsertedCount, 0),
  }
}

export async function generateCalendarEventReminderNotifications(
  clerkUids: string[] = [],
): Promise<CalendarReminderGenerationSummary> {
  const uniqueClerkUids = [...new Set(clerkUids.filter(Boolean))]
  const filter: Record<string, unknown> = {
    sourceType: { $in: ["manual", "task"] },
    reminderEnabled: true,
  }

  if (uniqueClerkUids.length > 0) {
    filter.clerkUid = { $in: uniqueClerkUids }
  }

  const calendarEvents = await CalendarEvent.find(filter)
    .sort({ date: 1, createdAt: 1 })
    .lean()
    .exec()

  const operations = []
  let eligibleCalendarReminders = 0

  for (const event of calendarEvents as CalendarEventSummary[]) {
    const reminderOffsets = sanitizeReminderOffsets(event.reminderOffsets)
    if (!event.reminderEnabled || reminderOffsets.length === 0) {
      continue
    }

    const parsedEventDate = parseCourtDate(event.date)
    if (!parsedEventDate) {
      continue
    }

    const daysUntilEvent = getDaysUntilDate(parsedEventDate)
    const matchingOffsets = reminderOffsets.filter((offset) => offset === daysUntilEvent)
    if (matchingOffsets.length === 0) {
      continue
    }

    const calendarEventId = getStringId(event._id)
    if (!calendarEventId) {
      continue
    }

    eligibleCalendarReminders += 1
    const normalizedEventDate = formatDateKey(parsedEventDate)

    for (const reminderWindowDays of matchingOffsets) {
      const dedupeKey = buildCalendarEventNotificationDedupeKey({
        clerkUid: event.clerkUid,
        calendarEventId,
        eventDate: normalizedEventDate,
        reminderWindowDays,
      })

      operations.push({
        updateOne: {
          filter: { dedupeKey },
          update: {
            $setOnInsert: {
              clerkUid: event.clerkUid,
              type: "calendar-event-reminder",
              title: buildCalendarReminderTitle(event.title, reminderWindowDays),
              message: buildCalendarReminderMessage(event, normalizedEventDate, reminderWindowDays),
              caseId: event.caseId || null,
              calendarEventId,
              caseTitle: event.title,
              hearingDate: normalizedEventDate,
              reminderWindowDays,
              resourceType: event.sourceType === "task" ? "task" : "calendar-event",
              resourceUrl: buildCalendarEventResourceUrl(event),
              channel: "email",
              status: "pending",
              retryCount: 0,
              lastAttemptAt: null,
              nextRetryAt: null,
              sentAt: null,
              readAt: null,
              emailTo: null,
              error: null,
              dedupeKey,
            },
          },
          upsert: true,
        },
      })
    }
  }

  if (operations.length === 0) {
    return {
      calendarEventsScanned: calendarEvents.length,
      eligibleCalendarReminders,
      calendarNotificationsPrepared: 0,
      calendarNotificationsCreated: 0,
      calendarDuplicatesSkipped: 0,
    }
  }

  const writeResult = await Notification.bulkWrite(operations, { ordered: false })

  return {
    calendarEventsScanned: calendarEvents.length,
    eligibleCalendarReminders,
    calendarNotificationsPrepared: operations.length,
    calendarNotificationsCreated: writeResult.upsertedCount,
    calendarDuplicatesSkipped: Math.max(operations.length - writeResult.upsertedCount, 0),
  }
}

export async function reconcilePendingHearingNotifications(
  users: UserWithCases[],
): Promise<NotificationReconciliationSummary> {
  const caseDateById = new Map<string, string>()

  for (const user of users) {
    const userCases = Array.isArray(user.cases) ? user.cases : []

    for (const caseRecord of userCases) {
      const caseId = getStringId(caseRecord?._id)
      if (!caseId || !caseRecord?.courtDate) {
        continue
      }

      const parsedDate = parseCourtDate(caseRecord.courtDate)
      if (!parsedDate) {
        continue
      }

      caseDateById.set(caseId, formatDateKey(parsedDate))
    }
  }

  const hearingNotifications = (await Notification.find({ type: "hearing-reminder" })
    .select("_id caseId hearingDate status")
    .lean()
    .exec()) as NotificationDocument[]

  const staleIds: string[] = []
  let pendingRemoved = 0
  let failedRemoved = 0

  for (const notificationRecord of hearingNotifications) {
    if (notificationRecord.status !== "pending" && notificationRecord.status !== "failed") {
      continue
    }

    const caseId = getStringId(notificationRecord.caseId)
    const activeCourtDate = caseId ? caseDateById.get(caseId) : null

    if (!activeCourtDate || activeCourtDate !== notificationRecord.hearingDate) {
      staleIds.push(getStringId(notificationRecord._id) || "")

      if (notificationRecord.status === "pending") {
        pendingRemoved += 1
      } else {
        failedRemoved += 1
      }
    }
  }

  const filteredStaleIds = staleIds.filter(Boolean)
  if (filteredStaleIds.length > 0) {
    await Notification.deleteMany({ _id: { $in: filteredStaleIds } }).exec()
  }

  return {
    pendingRemoved,
    failedRemoved,
    totalRemoved: pendingRemoved + failedRemoved,
  }
}

export async function reconcileNotificationsForCase(caseId: string, currentCourtDate?: string | null) {
  const parsedCourtDate = currentCourtDate ? parseCourtDate(currentCourtDate) : null
  const normalizedCourtDate = parsedCourtDate ? formatDateKey(parsedCourtDate) : null

  const caseNotifications = (await Notification.find({
    type: "hearing-reminder",
    caseId,
  })
    .select("_id hearingDate status")
    .lean()
    .exec()) as NotificationDocument[]

  const staleIds = caseNotifications
    .filter((notificationRecord) => {
      if (notificationRecord.status !== "pending" && notificationRecord.status !== "failed") {
        return false
      }

      if (!normalizedCourtDate) {
        return true
      }

      return notificationRecord.hearingDate !== normalizedCourtDate
    })
    .map((notificationRecord) => getStringId(notificationRecord._id) || "")
    .filter(Boolean)

  if (staleIds.length === 0) {
    return { removedCount: 0 }
  }

  const deleteResult = await Notification.deleteMany({ _id: { $in: staleIds } }).exec()

  return { removedCount: deleteResult.deletedCount || 0 }
}

const getDeliverableNotifications = async (now: Date) => {
  const [pendingNotifications, failedNotifications] = await Promise.all([
    Notification.find({ status: "pending" }).lean().exec(),
    Notification.find({ status: "failed" }).lean().exec(),
  ])

  return [...(pendingNotifications as NotificationDocument[]), ...(failedNotifications as NotificationDocument[])]
    .filter((notificationRecord) => shouldAttemptDelivery(notificationRecord, now))
    .sort(compareNotificationsForDelivery)
}

export async function sendPendingNotificationEmails(): Promise<ReminderDeliverySummary> {
  const now = new Date()
  const pendingNotifications = await getDeliverableNotifications(now)

  const summary: ReminderDeliverySummary = {
    deliveryEnabled: false,
    pendingFound: pendingNotifications.length,
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  }

  if (!pendingNotifications.length) {
    summary.deliveryEnabled = getSendGridConfig().isEnabled
    return summary
  }

  const sendGridConfig = getSendGridConfig()
  summary.deliveryEnabled = sendGridConfig.isEnabled

  if (!sendGridConfig.isEnabled) {
    summary.skipped = pendingNotifications.length
    return summary
  }

  sgMail.setApiKey(sendGridConfig.apiKey)

  const preferencesCache = new Map<string, NotificationPreferences>()

  for (const notificationRecord of pendingNotifications as NotificationDocument[]) {
    const cachedPreferences = preferencesCache.get(notificationRecord.clerkUid)
    const userPreferences = cachedPreferences || (await getNotificationPreferences(notificationRecord.clerkUid))
    preferencesCache.set(notificationRecord.clerkUid, userPreferences)

    if (!userPreferences.emailEnabled) {
      summary.skipped += 1
      await Notification.updateOne(
        { _id: notificationRecord._id },
        {
          $set: {
            status: "failed",
            retryCount: MAX_NOTIFICATION_RETRIES,
            nextRetryAt: null,
            lastAttemptAt: now,
            error: "Email notifications are disabled in user preferences.",
            emailTo: null,
          },
        },
      ).exec()
      continue
    }

    const currentHourInTimezone = getCurrentHourInTimezone(userPreferences.timezone, now)
    if (!isWithinSendWindow(currentHourInTimezone, userPreferences)) {
      summary.skipped += 1

      await Notification.updateOne(
        { _id: notificationRecord._id },
        {
          $set: {
            status: "pending",
            nextRetryAt: getDeferredSendDate(userPreferences, now),
            error: `Deferred to preferred send window (${userPreferences.sendWindowStartHour}:00-${userPreferences.sendWindowEndHour}:00 ${userPreferences.timezone}).`,
          },
        },
      ).exec()
      continue
    }

    const emailTo = await resolveUserEmail(notificationRecord.clerkUid, notificationRecord.emailTo)

    if (!emailTo) {
      summary.skipped += 1
      await Notification.updateOne(
        { _id: notificationRecord._id },
        {
          $set: {
            status: "failed",
            retryCount: MAX_NOTIFICATION_RETRIES,
            nextRetryAt: null,
            lastAttemptAt: now,
            error: "No email address is available for this user. Add an email in your account profile.",
            emailTo: null,
          },
        },
      ).exec()
      continue
    }

    summary.attempted += 1

    try {
      await sgMail.send({
        to: emailTo,
        from: {
          email: sendGridConfig.fromEmail,
          name: sendGridConfig.fromName,
        },
        subject: buildEmailSubject(notificationRecord),
        text: buildEmailText(notificationRecord),
      })

      summary.sent += 1

      await Notification.updateOne(
        { _id: notificationRecord._id },
        {
          $set: {
            status: "sent",
            sentAt: now,
            lastAttemptAt: now,
            nextRetryAt: null,
            error: null,
            emailTo,
          },
        },
      ).exec()
    } catch (error) {
      summary.failed += 1

      const nextRetryCount = getRetryCount(notificationRecord) + 1
      const shouldRetry = nextRetryCount < MAX_NOTIFICATION_RETRIES

      await Notification.updateOne(
        { _id: notificationRecord._id },
        {
          $set: {
            status: "failed",
            retryCount: nextRetryCount,
            lastAttemptAt: now,
            nextRetryAt: shouldRetry ? getRetryDate(nextRetryCount, now) : null,
            error: extractErrorMessage(error),
            emailTo,
          },
        },
      ).exec()
    }
  }

  return summary
}