import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import { enforceRateLimit, objectIdSchema, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
import {
  listNotificationsForUser,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/app/api/lib/services/notifications"

const markNotificationSchema = z
  .object({
    notificationId: objectIdSchema.optional(),
    markAll: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.markAll) || Boolean(value.notificationId), {
    message: "A valid notificationId is required",
  })

const parseLimit = (rawValue: string | null) => {
  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 8
  }

  return Math.min(parsed, 50)
}

export async function GET(request: NextRequest) {
  try {
    const userContext = await requireUserContext()
    if (userContext instanceof NextResponse) {
      return userContext
    }

    const userId = userContext.clerkUid

    const { blockedResponse } = await enforceRateLimit(request, {
      key: `userdetails:notifications:get:${userId}`,
      max: 180,
      windowMs: 10 * 60 * 1000,
    })

    if (blockedResponse) {
      return blockedResponse
    }

    await connectMongoWithRetry()

    const limitParam = parseLimit(request.nextUrl.searchParams.get("limit"))
    const { notifications, unreadCount } = await listNotificationsForUser(userId, limitParam)

    return NextResponse.json({
      success: true,
      notifications,
      unreadCount,
    })
  } catch (error) {
    console.error("Notifications GET error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch notifications" },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userContext = await requireUserContext()
    if (userContext instanceof NextResponse) {
      return userContext
    }

    const userId = userContext.clerkUid

    const { blockedResponse } = await enforceRateLimit(request, {
      key: `userdetails:notifications:patch:${userId}`,
      max: 120,
      windowMs: 10 * 60 * 1000,
    })

    if (blockedResponse) {
      return blockedResponse
    }

    await connectMongoWithRetry()

    const parsedBody = await parseAndValidateJson(request, markNotificationSchema)
    if (!parsedBody.success) {
      return parsedBody.response
    }

    if (parsedBody.data.markAll) {
      const result = await markAllNotificationsAsRead(userId)
      return NextResponse.json({ success: true, markedCount: result.markedCount })
    }

    if (!parsedBody.data.notificationId) {
      return NextResponse.json(
        { success: false, error: "A valid notificationId is required" },
        { status: 400 },
      )
    }

    const result = await markNotificationAsRead(userId, parsedBody.data.notificationId)

    if (!result.found) {
      return NextResponse.json({ success: false, error: "Notification not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true, markedCount: result.markedCount })
  } catch (error) {
    console.error("Notifications PATCH error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update notifications" },
      { status: 500 },
    )
  }
}