import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockState = vi.hoisted(() => {
  const notificationRecords: Record<string, unknown>[] = []
  const userRecords: Record<string, unknown>[] = []
  const calendarEventRecords: Record<string, unknown>[] = []
  let notificationIdCounter = 1

  const clone = <T>(value: T): T => {
    if (typeof structuredClone === "function") {
      return structuredClone(value)
    }

    return JSON.parse(JSON.stringify(value)) as T
  }

  const toComparable = (value: unknown) => {
    if (value instanceof Date) {
      return value.getTime()
    }

    if (typeof value === "string") {
      const parsedDate = new Date(value)
      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate.getTime()
      }
    }

    return value
  }

  const matches = (record: Record<string, unknown>, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([key, expectedValue]) => {
      const actualValue = record[key]

      if (expectedValue && typeof expectedValue === "object" && !Array.isArray(expectedValue)) {
        const expectedRecord = expectedValue as Record<string, unknown>
        const inValues = expectedRecord.$in

        if (Array.isArray(inValues)) {
          return inValues.some((value) => String(value) === String(actualValue))
        }
      }

      if (expectedValue === null) {
        return actualValue === null || typeof actualValue === "undefined"
      }

      return String(actualValue) === String(expectedValue)
    })

  const buildFindQuery = (records: Record<string, unknown>[]) => {
    let currentRecords = [...records]

    return {
      select() {
        return this
      },
      sort(sortSpec: Record<string, 1 | -1>) {
        const [field, direction] = Object.entries(sortSpec)[0] || []

        if (field && direction) {
          currentRecords = [...currentRecords].sort((leftRecord, rightRecord) => {
            const leftValue = toComparable(leftRecord[field])
            const rightValue = toComparable(rightRecord[field])

            if (leftValue === rightValue) {
              return 0
            }

            if (leftValue === null || typeof leftValue === "undefined") {
              return 1
            }

            if (rightValue === null || typeof rightValue === "undefined") {
              return -1
            }

            return leftValue > rightValue ? direction : -direction
          })
        }

        return this
      },
      limit(value: number) {
        currentRecords = currentRecords.slice(0, value)
        return this
      },
      lean() {
        return this
      },
      async exec() {
        return clone(currentRecords)
      },
    }
  }

  const notificationModelMock = {
    reset() {
      notificationRecords.length = 0
      notificationIdCounter = 1
    },
    bulkWrite: vi.fn(async (operations: Array<Record<string, unknown>>) => {
      let upsertedCount = 0

      for (const operation of operations) {
        const updateOne = operation.updateOne as Record<string, unknown> | undefined
        const dedupeKey = (updateOne?.filter as Record<string, unknown> | undefined)?.dedupeKey

        if (typeof dedupeKey !== "string") {
          continue
        }

        const alreadyExists = notificationRecords.some(
          (record) => String(record.dedupeKey) === dedupeKey,
        )

        if (alreadyExists) {
          continue
        }

        const setOnInsert =
          ((updateOne?.update as Record<string, unknown> | undefined)
            ?.$setOnInsert as Record<string, unknown> | undefined) || {}
        const now = new Date()

        notificationRecords.push({
          _id: `notif_${notificationIdCounter++}`,
          ...clone(setOnInsert),
          createdAt: now,
          updatedAt: now,
        })

        upsertedCount += 1
      }

      return { upsertedCount }
    }),
    find: vi.fn((filter: Record<string, unknown>) => {
      const matched = notificationRecords.filter((record) => matches(record, filter))
      return buildFindQuery(matched)
    }),
    countDocuments: vi.fn(async (filter: Record<string, unknown>) => {
      return notificationRecords.filter((record) => matches(record, filter)).length
    }),
    updateOne: vi.fn((filter: Record<string, unknown>, update: Record<string, unknown>) => {
      return {
        async exec() {
          const matchedRecord = notificationRecords.find((record) => matches(record, filter))

          if (!matchedRecord) {
            return { matchedCount: 0, modifiedCount: 0 }
          }

          const hasSet = Boolean(update.$set && typeof update.$set === "object")
          const beforeSnapshot = JSON.stringify(matchedRecord)

          if (hasSet) {
            Object.assign(matchedRecord, update.$set as Record<string, unknown>)
          }

          matchedRecord.updatedAt = new Date()

          const afterSnapshot = JSON.stringify(matchedRecord)

          return {
            matchedCount: 1,
            modifiedCount: beforeSnapshot === afterSnapshot ? 0 : 1,
          }
        },
      }
    }),
    updateMany: vi.fn((filter: Record<string, unknown>, update: Record<string, unknown>) => {
      return {
        async exec() {
          let modifiedCount = 0

          for (const record of notificationRecords) {
            if (!matches(record, filter)) {
              continue
            }

            if (update.$set && typeof update.$set === "object") {
              Object.assign(record, update.$set as Record<string, unknown>)
            }

            record.updatedAt = new Date()
            modifiedCount += 1
          }

          return { modifiedCount }
        },
      }
    }),
    exists: vi.fn(async (filter: Record<string, unknown>) => {
      const matchedRecord = notificationRecords.find((record) => matches(record, filter))
      return matchedRecord ? { _id: matchedRecord._id } : null
    }),
    deleteMany: vi.fn((filter: Record<string, unknown>) => {
      return {
        async exec() {
          const ids = ((filter._id as Record<string, unknown> | undefined)?.$in as unknown[]) || []
          const stringIds = new Set(ids.map((value) => String(value)))
          const beforeCount = notificationRecords.length

          for (let index = notificationRecords.length - 1; index >= 0; index -= 1) {
            if (stringIds.has(String(notificationRecords[index]._id))) {
              notificationRecords.splice(index, 1)
            }
          }

          return { deletedCount: beforeCount - notificationRecords.length }
        },
      }
    }),
  }

  const userModelMock = {
    reset() {
      userRecords.length = 0
    },
    seed(records: Record<string, unknown>[]) {
      userRecords.length = 0
      userRecords.push(...records.map((record) => clone(record)))
    },
    findOne: vi.fn((filter: Record<string, unknown>) => {
      const matchedRecord = userRecords.find((record) => matches(record, filter)) || null

      return {
        select() {
          return {
            lean() {
              return {
                async exec() {
                  return matchedRecord ? clone(matchedRecord) : null
                },
              }
            },
          }
        },
      }
    }),
    updateOne: vi.fn((filter: Record<string, unknown>, update: Record<string, unknown>) => {
      return {
        async exec() {
          const matchedRecord = userRecords.find((record) => matches(record, filter))

          if (matchedRecord && update.$set && typeof update.$set === "object") {
            Object.assign(matchedRecord, update.$set as Record<string, unknown>)
          }

          return { acknowledged: true }
        },
      }
    }),
  }

  const calendarEventModelMock = {
    reset() {
      calendarEventRecords.length = 0
    },
    seed(records: Record<string, unknown>[]) {
      calendarEventRecords.length = 0
      calendarEventRecords.push(...records.map((record) => clone(record)))
    },
    find: vi.fn((filter: Record<string, unknown>) => {
      const matched = calendarEventRecords.filter((record) => matches(record, filter))
      return buildFindQuery(matched)
    }),
  }

  const sendMailMock = vi.fn()
  const setApiKeyMock = vi.fn()
  const clerkGetUserMock = vi.fn()

  return {
    notificationModelMock,
    userModelMock,
    calendarEventModelMock,
    sendMailMock,
    setApiKeyMock,
    clerkGetUserMock,
  }
})

vi.mock("@/app/api/lib/models/notification", () => ({
  default: mockState.notificationModelMock,
}))

vi.mock("@/app/api/lib/models/user", () => ({
  default: mockState.userModelMock,
}))

vi.mock("@/app/api/lib/models/calendar-event", () => ({
  default: mockState.calendarEventModelMock,
}))

vi.mock("@sendgrid/mail", () => ({
  default: {
    send: mockState.sendMailMock,
    setApiKey: mockState.setApiKeyMock,
  },
}))

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    users: {
      getUser: mockState.clerkGetUserMock,
    },
  }),
}))

import {
  generateCalendarEventReminderNotifications,
  generateHearingReminderNotifications,
  listNotificationsForUser,
  markNotificationAsRead,
  sendPendingNotificationEmails,
} from "@/app/api/lib/services/notifications"

describe("Notification MVP smoke flow", () => {
  beforeEach(() => {
    mockState.notificationModelMock.reset()
    mockState.userModelMock.reset()
    mockState.calendarEventModelMock.reset()
    mockState.sendMailMock.mockReset()
    mockState.setApiKeyMock.mockReset()
    mockState.clerkGetUserMock.mockReset()

    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-15T05:30:00.000Z"))

    vi.stubEnv("SENDGRID_API_KEY", "sg_test_key")
    vi.stubEnv("NOTIFICATION_FROM_EMAIL", "notifications@lexvert.test")
    vi.stubEnv("NOTIFICATION_FROM_NAME", "LexVert")
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://lexvert.example")
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it("generates, deduplicates, sends, and marks notifications as read", async () => {
    const users = [
      {
        clerkUid: "user_123",
        email: "lawyer@example.com",
        cases: [
          {
            _id: "case_001",
            caseTitle: "Sharma vs State",
            courtDate: "2026-03-22",
            courtName: "Delhi High Court",
          },
        ],
      },
    ]

    const firstGenerationSummary = await generateHearingReminderNotifications(users)

    expect(firstGenerationSummary.notificationsPrepared).toBe(1)
    expect(firstGenerationSummary.notificationsCreated).toBe(1)
    expect(firstGenerationSummary.duplicatesSkipped).toBe(0)

    const secondGenerationSummary = await generateHearingReminderNotifications(users)

    expect(secondGenerationSummary.notificationsPrepared).toBe(1)
    expect(secondGenerationSummary.notificationsCreated).toBe(0)
    expect(secondGenerationSummary.duplicatesSkipped).toBe(1)

    const deliverySummary = await sendPendingNotificationEmails()

    expect(deliverySummary.deliveryEnabled).toBe(true)
    expect(deliverySummary.pendingFound).toBe(1)
    expect(deliverySummary.attempted).toBe(1)
    expect(deliverySummary.sent).toBe(1)
    expect(deliverySummary.failed).toBe(0)
    expect(deliverySummary.skipped).toBe(0)
    expect(mockState.setApiKeyMock).toHaveBeenCalledWith("sg_test_key")
    expect(mockState.sendMailMock).toHaveBeenCalledTimes(1)

    const [sendArgs] = mockState.sendMailMock.mock.calls[0]
    expect(sendArgs.subject).toContain("Upcoming hearing in 7 days")
    expect(sendArgs.text).toContain("https://lexvert.example/case-tracking/view/case_001")

    const beforeMarkRead = await listNotificationsForUser("user_123", 8)
    expect(beforeMarkRead.unreadCount).toBe(1)
    expect(beforeMarkRead.notifications[0].status).toBe("sent")

    const notificationId = beforeMarkRead.notifications[0]._id
    const markResult = await markNotificationAsRead("user_123", notificationId)

    expect(markResult.found).toBe(true)
    expect(markResult.markedCount).toBe(1)

    const afterMarkRead = await listNotificationsForUser("user_123", 8)
    expect(afterMarkRead.unreadCount).toBe(0)
    expect(afterMarkRead.notifications[0].isRead).toBe(true)
    expect(afterMarkRead.notifications[0].readAt).not.toBeNull()
  })

  it("generates calendar reminders, deduplicates them, and sends email delivery", async () => {
    mockState.calendarEventModelMock.seed([
      {
        _id: "event_001",
        clerkUid: "user_123",
        title: "Prepare filing draft",
        description: "Review supporting documents",
        date: "2026-03-22",
        sourceType: "manual",
        caseId: null,
        reminderEnabled: true,
        reminderOffsets: [7],
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    ])

    const firstGenerationSummary = await generateCalendarEventReminderNotifications(["user_123"])

    expect(firstGenerationSummary.calendarEventsScanned).toBe(1)
    expect(firstGenerationSummary.eligibleCalendarReminders).toBe(1)
    expect(firstGenerationSummary.calendarNotificationsPrepared).toBe(1)
    expect(firstGenerationSummary.calendarNotificationsCreated).toBe(1)
    expect(firstGenerationSummary.calendarDuplicatesSkipped).toBe(0)

    const secondGenerationSummary = await generateCalendarEventReminderNotifications(["user_123"])

    expect(secondGenerationSummary.calendarNotificationsPrepared).toBe(1)
    expect(secondGenerationSummary.calendarNotificationsCreated).toBe(0)
    expect(secondGenerationSummary.calendarDuplicatesSkipped).toBe(1)

    const pendingBeforeDelivery = await listNotificationsForUser("user_123", 8)
    expect(pendingBeforeDelivery.notifications).toHaveLength(1)
    expect(pendingBeforeDelivery.notifications[0].type).toBe("calendar-event-reminder")
    expect(pendingBeforeDelivery.notifications[0].resourceType).toBe("calendar-event")

    mockState.clerkGetUserMock.mockResolvedValue({
      emailAddresses: [{ emailAddress: "calendar@example.com" }],
    })

    const deliverySummary = await sendPendingNotificationEmails()

    expect(deliverySummary.pendingFound).toBe(1)
    expect(deliverySummary.attempted).toBe(1)
    expect(deliverySummary.sent).toBe(1)
    expect(deliverySummary.failed).toBe(0)
    expect(mockState.sendMailMock).toHaveBeenCalledTimes(1)

    const [sendArgs] = mockState.sendMailMock.mock.calls[0]
    expect(sendArgs.subject).toContain("Upcoming event in 7 days")
    expect(sendArgs.text).toContain("https://lexvert.example/dashboard")
  })

  it("defers delivery outside the user's configured send window", async () => {
    mockState.userModelMock.seed([
      {
        clerkUid: "user_window",
        notificationPreferences: {
          emailEnabled: true,
          timezone: "Asia/Kolkata",
          sendWindowStartHour: 18,
          sendWindowEndHour: 22,
          reminderOffsets: [7, 3, 1],
        },
      },
    ])

    await generateHearingReminderNotifications([
      {
        clerkUid: "user_window",
        email: "window@example.com",
        notificationPreferences: {
          emailEnabled: true,
          timezone: "Asia/Kolkata",
          sendWindowStartHour: 18,
          sendWindowEndHour: 22,
          reminderOffsets: [7, 3, 1],
        },
        cases: [
          {
            _id: "case_window",
            caseTitle: "Windowed Matter",
            courtDate: "2026-03-22",
            courtName: "Delhi High Court",
          },
        ],
      },
    ])

    const deliverySummary = await sendPendingNotificationEmails()

    expect(deliverySummary.pendingFound).toBe(1)
    expect(deliverySummary.attempted).toBe(0)
    expect(deliverySummary.sent).toBe(0)
    expect(deliverySummary.skipped).toBe(1)
    expect(mockState.sendMailMock).not.toHaveBeenCalled()

    const notifications = await listNotificationsForUser("user_window", 5)
    expect(notifications.notifications[0].status).toBe("pending")
    expect(notifications.notifications[0].error).toContain("Deferred to preferred send window")
  })

  it("retries failed deliveries until the retry limit is reached", async () => {
    mockState.sendMailMock.mockRejectedValue(new Error("SMTP timeout"))

    await generateHearingReminderNotifications([
      {
        clerkUid: "user_retry",
        email: "retry@example.com",
        cases: [
          {
            _id: "case_retry",
            caseTitle: "Retry Matter",
            courtDate: "2026-03-22",
            courtName: "Delhi High Court",
          },
        ],
      },
    ])

    const firstAttempt = await sendPendingNotificationEmails()
    expect(firstAttempt.attempted).toBe(1)
    expect(firstAttempt.failed).toBe(1)

    const afterFirstAttempt = await listNotificationsForUser("user_retry", 5)
    expect(afterFirstAttempt.notifications[0].status).toBe("failed")

    vi.setSystemTime(new Date("2026-03-15T06:00:01.000Z"))

    const secondAttempt = await sendPendingNotificationEmails()
    expect(secondAttempt.pendingFound).toBe(1)
    expect(secondAttempt.attempted).toBe(1)
    expect(secondAttempt.failed).toBe(1)

    const afterSecondAttempt = await listNotificationsForUser("user_retry", 5)
    expect(afterSecondAttempt.notifications[0].status).toBe("failed")
    expect(afterSecondAttempt.notifications[0].error).toBe("SMTP timeout")
  })

  it("marks notifications as failed without retry when no email can be resolved", async () => {
    await generateCalendarEventReminderNotifications(["user_missing_email"])

    mockState.calendarEventModelMock.seed([
      {
        _id: "event_missing_email",
        clerkUid: "user_missing_email",
        title: "Missing Email Event",
        date: "2026-03-22",
        sourceType: "manual",
        caseId: null,
        reminderEnabled: true,
        reminderOffsets: [7],
      },
    ])

    await generateCalendarEventReminderNotifications(["user_missing_email"])
    mockState.clerkGetUserMock.mockResolvedValue({ emailAddresses: [] })

    const deliverySummary = await sendPendingNotificationEmails()

    expect(deliverySummary.pendingFound).toBe(1)
    expect(deliverySummary.attempted).toBe(0)
    expect(deliverySummary.skipped).toBe(1)
    expect(mockState.sendMailMock).not.toHaveBeenCalled()

    const notifications = await listNotificationsForUser("user_missing_email", 5)
    expect(notifications.notifications[0].status).toBe("failed")
    expect(notifications.notifications[0].error).toContain("No email address is available")
  })
})