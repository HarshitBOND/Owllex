import CalendarEvent from "@/app/api/lib/models/calendar-event"
import Task from "@/app/api/lib/models/task"
import User from "@/app/api/lib/models/user"
import {
  formatDateKey,
  parseCourtDate,
  REMINDER_WINDOWS,
  type ReminderWindowDays,
} from "@/lib/hearingDates"

export type CalendarEventColor = "blue" | "violet" | "emerald" | "amber" | "rose"
export type CalendarEventSourceType = "manual" | "task" | "hearing"

type SerializableId = { toString(): string } | string

type CalendarEventDocument = {
  _id: SerializableId
  clerkUid: string
  title: string
  description?: string | null
  date: string
  color: CalendarEventColor
  sourceType: CalendarEventSourceType
  sourceKey?: string | null
  caseId?: SerializableId | null
  taskId?: SerializableId | null
  reminderEnabled?: boolean
  reminderOffsets?: ReminderWindowDays[]
  isLocked?: boolean
  createdAt?: Date | string
  updatedAt?: Date | string
}

type PopulatedCaseRecord = {
  _id: SerializableId
  caseNo?: string | null
  caseTitle?: string | null
  courtDate?: string | null
  courtName?: string | null
  courtRoom?: string | null
}

type TaskCaseLink = {
  _id: SerializableId
  caseTitle?: string | null
  caseNo?: string | null
}

type TaskRecord = {
  _id: SerializableId
  task: string
  dueDate?: string | null
  dueTime?: string | null
  reminder?: {
    reminderTime?: string | null
    reminderTimeUnit?: string | null
  } | null
  category?: string | null
  resourceName?: string | null
  caseId?: TaskCaseLink | SerializableId | null
}

type ManualCalendarEventInput = {
  title?: unknown
  description?: unknown
  date?: unknown
  color?: unknown
  reminderEnabled?: unknown
  reminderOffsets?: unknown
}

type ValidationResult =
  | {
      success: true
      value: {
        title: string
        description: string
        date: string
        color: CalendarEventColor
        reminderEnabled: boolean
        reminderOffsets: ReminderWindowDays[]
      }
    }
  | {
      success: false
      error: string
    }

type CalendarMutationResult =
  | { success: true; event: SerializedCalendarEvent }
  | { success: false; reason: "not-found" | "locked" }

type DerivedCalendarEvent = {
  clerkUid: string
  title: string
  description: string
  date: string
  color: CalendarEventColor
  sourceType: Exclude<CalendarEventSourceType, "manual">
  sourceKey: string
  caseId: string | null
  taskId: string | null
  reminderEnabled: boolean
  reminderOffsets: ReminderWindowDays[]
  isLocked: true
}

export type SerializedCalendarEvent = {
  id: string
  title: string
  description: string | null
  date: string
  color: CalendarEventColor
  sourceType: CalendarEventSourceType
  isHearing: boolean
  isTask: boolean
  isManual: boolean
  caseId: string | null
  taskId: string | null
  reminderEnabled: boolean
  reminderOffsets: ReminderWindowDays[]
  canEdit: boolean
  canDelete: boolean
  resourceUrl: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type CalendarSyncSummary = {
  hearingsSynced: number
  tasksSynced: number
  staleDerivedEventsRemoved: number
}

const CALENDAR_EVENT_COLORS: CalendarEventColor[] = ["blue", "violet", "emerald", "amber", "rose"]
const CALENDAR_EVENT_COLOR_SET = new Set<CalendarEventColor>(CALENDAR_EVENT_COLORS)

const toIsoString = (value?: Date | string | null) => {
  if (!value) {
    return null
  }

  return new Date(value).toISOString()
}

const getStringId = (value?: SerializableId | null) => (value ? value.toString() : null)

const isSupportedReminderOffset = (value: number): value is ReminderWindowDays =>
  REMINDER_WINDOWS.includes(value as ReminderWindowDays)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const isTaskCaseLink = (value: unknown): value is TaskCaseLink => isRecord(value) && "_id" in value

const buildEventResourceUrl = ({
  sourceType,
  caseId,
}: {
  sourceType: CalendarEventSourceType
  caseId: string | null
}) => {
  if (sourceType === "hearing" && caseId) {
    return `/case-tracking/view/${caseId}`
  }

  if (sourceType === "task") {
    return "/tasks"
  }

  return "/dashboard"
}

const buildHearingTitle = (caseRecord: PopulatedCaseRecord) =>
  caseRecord.caseTitle?.trim() || caseRecord.caseNo?.trim() || "Hearing"

const buildHearingDescription = (caseRecord: PopulatedCaseRecord) =>
  [caseRecord.caseNo?.trim(), caseRecord.courtName?.trim(), caseRecord.courtRoom?.trim()]
    .filter(Boolean)
    .join(" · ")

const buildTaskDescription = (taskRecord: TaskRecord) => {
  const linkedCase = isTaskCaseLink(taskRecord.caseId) ? taskRecord.caseId : null

  return [
    linkedCase?.caseTitle?.trim() || linkedCase?.caseNo?.trim() || null,
    taskRecord.resourceName?.trim() || null,
    taskRecord.category?.trim() || null,
    taskRecord.dueTime?.trim() ? `Due ${taskRecord.dueTime.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

export function normalizeCalendarEventDate(value: unknown) {
  if (value instanceof Date) {
    return formatDateKey(value)
  }

  if (typeof value !== "string") {
    return null
  }

  const parsedDate = parseCourtDate(value)
  if (!parsedDate) {
    return null
  }

  return formatDateKey(parsedDate)
}

export function sanitizeCalendarReminderOffsets(offsets: unknown): ReminderWindowDays[] {
  const rawOffsets = Array.isArray(offsets)
    ? offsets
    : typeof offsets === "number" || typeof offsets === "string"
      ? [offsets]
      : []

  const parsedOffsets = rawOffsets
    .map((value) => Number(value))
    .filter((value): value is ReminderWindowDays => Number.isFinite(value) && isSupportedReminderOffset(value))

  return [...new Set(parsedOffsets)].sort((left, right) => right - left) as ReminderWindowDays[]
}

export function getTaskReminderOffsets(
  reminder?: {
    reminderTime?: string | null
    reminderTimeUnit?: string | null
  } | null,
): ReminderWindowDays[] {
  if (!reminder?.reminderTime || !reminder.reminderTimeUnit) {
    return []
  }

  if (reminder.reminderTimeUnit !== "days") {
    return []
  }

  const daysBefore = Number(reminder.reminderTime)
  if (!Number.isFinite(daysBefore) || !isSupportedReminderOffset(daysBefore)) {
    return []
  }

  return [daysBefore]
}

export function validateManualCalendarEventInput(input: ManualCalendarEventInput): ValidationResult {
  const title = typeof input.title === "string" ? input.title.trim() : ""
  if (!title) {
    return { success: false, error: "Event title is required" }
  }

  const date = normalizeCalendarEventDate(input.date)
  if (!date) {
    return { success: false, error: "A valid event date is required" }
  }

  const description = typeof input.description === "string" ? input.description.trim() : ""
  const color = typeof input.color === "string" && CALENDAR_EVENT_COLOR_SET.has(input.color as CalendarEventColor)
    ? (input.color as CalendarEventColor)
    : "blue"

  const reminderOffsets = sanitizeCalendarReminderOffsets(input.reminderOffsets)
  const reminderEnabled =
    typeof input.reminderEnabled === "boolean"
      ? input.reminderEnabled && reminderOffsets.length > 0
      : reminderOffsets.length > 0

  return {
    success: true,
    value: {
      title,
      description,
      date,
      color,
      reminderEnabled,
      reminderOffsets: reminderEnabled ? reminderOffsets : [],
    },
  }
}

export function serializeCalendarEvent(event: CalendarEventDocument): SerializedCalendarEvent {
  const caseId = getStringId(event.caseId)
  const taskId = getStringId(event.taskId)

  return {
    id: getStringId(event._id) || "",
    title: event.title,
    description: event.description?.trim() || null,
    date: event.date,
    color: event.color || "blue",
    sourceType: event.sourceType,
    isHearing: event.sourceType === "hearing",
    isTask: event.sourceType === "task",
    isManual: event.sourceType === "manual",
    caseId,
    taskId,
    reminderEnabled: Boolean(event.reminderEnabled),
    reminderOffsets: sanitizeCalendarReminderOffsets(event.reminderOffsets),
    canEdit: event.sourceType === "manual" && !event.isLocked,
    canDelete: event.sourceType === "manual" && !event.isLocked,
    resourceUrl: buildEventResourceUrl({ sourceType: event.sourceType, caseId }),
    createdAt: toIsoString(event.createdAt),
    updatedAt: toIsoString(event.updatedAt),
  }
}

export async function listCalendarEventsForUser(clerkUid: string): Promise<SerializedCalendarEvent[]> {
  const events = await CalendarEvent.find({ clerkUid })
    .sort({ date: 1, createdAt: 1, title: 1 })
    .lean()
    .exec()

  return events.map((event) => serializeCalendarEvent(event as CalendarEventDocument))
}

const buildDerivedHearingEvent = (clerkUid: string, caseRecord: PopulatedCaseRecord): DerivedCalendarEvent | null => {
  if (!caseRecord?._id || !caseRecord.courtDate) {
    return null
  }

  const parsedDate = parseCourtDate(caseRecord.courtDate)
  if (!parsedDate) {
    return null
  }

  const caseId = getStringId(caseRecord._id)
  if (!caseId) {
    return null
  }

  return {
    clerkUid,
    title: buildHearingTitle(caseRecord),
    description: buildHearingDescription(caseRecord),
    date: formatDateKey(parsedDate),
    color: "violet",
    sourceType: "hearing",
    sourceKey: `hearing:${caseId}`,
    caseId,
    taskId: null,
    reminderEnabled: true,
    reminderOffsets: [...REMINDER_WINDOWS],
    isLocked: true,
  }
}

const buildDerivedTaskEvent = (clerkUid: string, taskRecord: TaskRecord): DerivedCalendarEvent | null => {
  if (!taskRecord?._id || !taskRecord.dueDate) {
    return null
  }

  const parsedDate = parseCourtDate(taskRecord.dueDate)
  if (!parsedDate) {
    return null
  }

  const taskId = getStringId(taskRecord._id)
  if (!taskId) {
    return null
  }

  const linkedCase = isTaskCaseLink(taskRecord.caseId) ? taskRecord.caseId : null
  const reminderOffsets = getTaskReminderOffsets(taskRecord.reminder)

  return {
    clerkUid,
    title: taskRecord.task?.trim() || "Task",
    description: buildTaskDescription(taskRecord),
    date: formatDateKey(parsedDate),
    color: "emerald",
    sourceType: "task",
    sourceKey: `task:${taskId}`,
    caseId: getStringId(linkedCase?._id) || null,
    taskId,
    reminderEnabled: reminderOffsets.length > 0,
    reminderOffsets,
    isLocked: true,
  }
}

export async function syncCalendarEventsForUser(clerkUid: string): Promise<CalendarSyncSummary> {
  const [user, tasks] = await Promise.all([
    User.findOne({ clerkUid })
      .select("cases")
      .populate({
        path: "cases",
        select: "_id caseNo caseTitle courtDate courtName courtRoom",
      })
      .lean()
      .exec(),
    Task.find({ clerkUid, status: { $ne: "completed" } })
      .select("_id task dueDate dueTime reminder category resourceName caseId")
      .populate({
        path: "caseId",
        select: "_id caseTitle caseNo",
      })
      .lean()
      .exec(),
  ])

  const hearingEvents = ((user?.cases as PopulatedCaseRecord[] | undefined) || [])
    .map((caseRecord) => buildDerivedHearingEvent(clerkUid, caseRecord))
    .filter((event): event is DerivedCalendarEvent => Boolean(event))

  const taskEvents = (tasks as TaskRecord[])
    .map((taskRecord) => buildDerivedTaskEvent(clerkUid, taskRecord))
    .filter((event): event is DerivedCalendarEvent => Boolean(event))

  const derivedEvents = [...hearingEvents, ...taskEvents]
  const sourceKeys = derivedEvents.map((event) => event.sourceKey)

  if (derivedEvents.length > 0) {
    await CalendarEvent.bulkWrite(
      derivedEvents.map((event) => ({
        updateOne: {
          filter: {
            clerkUid,
            sourceKey: event.sourceKey,
          },
          update: {
            $set: event,
          },
          upsert: true,
        },
      })),
      { ordered: false },
    )
  }

  const staleDerivedEventsFilter = sourceKeys.length
    ? {
        clerkUid,
        sourceType: { $in: ["hearing", "task"] },
        sourceKey: { $nin: sourceKeys },
      }
    : {
        clerkUid,
        sourceType: { $in: ["hearing", "task"] },
      }

  const deleteResult = await CalendarEvent.deleteMany(staleDerivedEventsFilter).exec()

  return {
    hearingsSynced: hearingEvents.length,
    tasksSynced: taskEvents.length,
    staleDerivedEventsRemoved: deleteResult.deletedCount || 0,
  }
}

export async function syncCalendarEventsForUsers(clerkUids: string[]) {
  const uniqueClerkUids = [...new Set(clerkUids.filter(Boolean))]

  for (const clerkUid of uniqueClerkUids) {
    await syncCalendarEventsForUser(clerkUid)
  }
}

export async function getCalendarEventForUser(clerkUid: string, eventId: string) {
  const event = await CalendarEvent.findOne({ _id: eventId, clerkUid }).lean().exec()

  if (!event) {
    return null
  }

  return serializeCalendarEvent(event as CalendarEventDocument)
}

export async function createManualCalendarEvent(
  clerkUid: string,
  input: ManualCalendarEventInput,
): Promise<ValidationResult | { success: true; event: SerializedCalendarEvent }> {
  const validation = validateManualCalendarEventInput(input)
  if (!validation.success) {
    return validation
  }

  const createdEvent = await CalendarEvent.create({
    clerkUid,
    ...validation.value,
    sourceType: "manual",
    sourceKey: null,
    caseId: null,
    taskId: null,
    isLocked: false,
  })

  return {
    success: true,
    event: serializeCalendarEvent(createdEvent.toObject() as CalendarEventDocument),
  }
}

export async function updateManualCalendarEvent(
  clerkUid: string,
  eventId: string,
  input: ManualCalendarEventInput,
): Promise<ValidationResult | CalendarMutationResult> {
  const validation = validateManualCalendarEventInput(input)
  if (!validation.success) {
    return validation
  }

  const existingEvent = await CalendarEvent.findOne({ _id: eventId, clerkUid })
  if (!existingEvent) {
    return { success: false, reason: "not-found" }
  }

  if (existingEvent.sourceType !== "manual" || existingEvent.isLocked) {
    return { success: false, reason: "locked" }
  }

  existingEvent.title = validation.value.title
  existingEvent.description = validation.value.description
  existingEvent.date = validation.value.date
  existingEvent.color = validation.value.color
  existingEvent.reminderEnabled = validation.value.reminderEnabled
  existingEvent.reminderOffsets = validation.value.reminderOffsets

  await existingEvent.save()

  return {
    success: true,
    event: serializeCalendarEvent(existingEvent.toObject() as CalendarEventDocument),
  }
}

export async function deleteManualCalendarEvent(
  clerkUid: string,
  eventId: string,
): Promise<CalendarMutationResult> {
  const existingEvent = await CalendarEvent.findOne({ _id: eventId, clerkUid })
  if (!existingEvent) {
    return { success: false, reason: "not-found" }
  }

  if (existingEvent.sourceType !== "manual" || existingEvent.isLocked) {
    return { success: false, reason: "locked" }
  }

  await existingEvent.deleteOne()

  return {
    success: true,
    event: serializeCalendarEvent(existingEvent.toObject() as CalendarEventDocument),
  }
}
