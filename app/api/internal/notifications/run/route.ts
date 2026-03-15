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

    const summary = await runNotificationJob()

    return NextResponse.json({
      success: true,
      summary,
    })
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