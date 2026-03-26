import { NextRequest, NextResponse } from "next/server"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import User from "@/app/api/lib/models/user"
import { syncCalendarEventsForUsers } from "@/app/api/lib/services/calendar"
import { hasValidCronSecret } from "@/app/api/lib/services/notificationRunnerAuth"
import {
  generateCalendarEventReminderNotifications,
  generateHearingReminderNotifications,
  reconcilePendingHearingNotifications,
  sendPendingNotificationEmails,
} from "@/app/api/lib/services/notifications"
import { completeJobRun, failJobRun, startJobRun } from "@/app/api/lib/services/jobRun"
import { enforceRateLimit } from "@/app/api/lib/routeGuards"

const isAuthorized = (request: NextRequest) => {
  return hasValidCronSecret({
    configuredSecret: process.env.CRON_SECRET,
    secretHeader: request.headers.get("x-cron-secret"),
    authorizationHeader: request.headers.get("authorization"),
  })
}

const runNotificationJob = async () => {
  await connectMongoWithRetry()

  const users = await User.find({ clerkUid: { $exists: true, $ne: null } })
    .select("clerkUid email firstName lastName notificationPreferences cases")
    .populate({
      path: "cases",
      select: "_id caseNo caseTitle courtDate courtName",
    })
    .lean()
    .exec()

  const clerkUids = users
    .map((user) => user.clerkUid)
    .filter((value): value is string => typeof value === "string" && value.length > 0)

  await syncCalendarEventsForUsers(clerkUids)

  const generationSummary = await generateHearingReminderNotifications(users as never[])
  const calendarGenerationSummary = await generateCalendarEventReminderNotifications(clerkUids)
  const reconciliationSummary = await reconcilePendingHearingNotifications(users as never[])
  const deliverySummary = await sendPendingNotificationEmails()

  return {
    ...generationSummary,
    ...calendarGenerationSummary,
    ...reconciliationSummary,
    ...deliverySummary,
  }
}

const handleRunRequest = async (request: NextRequest) => {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { blockedResponse } = await enforceRateLimit(request, {
      key: "internal:notifications:runner",
      max: 30,
      windowMs: 5 * 60 * 1000,
    })

    if (blockedResponse) {
      return blockedResponse
    }

    const run = await startJobRun({
      jobName: "notifications-runner",
      trigger: "cron",
      metadata: {
        route: "/api/internal/notifications/run",
      },
    })

    try {
      const summary = await runNotificationJob()

      await completeJobRun({
        runId: run._id.toString(),
        status: "success",
        summary,
      })

      return NextResponse.json({
        success: true,
        runId: run._id,
        summary,
      })
    } catch (runnerError) {
      await failJobRun({
        runId: run._id.toString(),
        error: runnerError,
      })

      throw runnerError
    }
  } catch (error) {
    console.error("Notification runner error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to run notification reminder job" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  return handleRunRequest(request)
}

export async function GET(request: NextRequest) {
  return handleRunRequest(request)
}