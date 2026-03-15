import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { Types } from "mongoose"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import { ensureUser } from "@/app/api/lib/ensureUser"
import {
  listNotificationsForUser,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/app/api/lib/services/notifications"

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    await ensureUser(userId)
    await connectMongoWithRetry()

    const limitParam = Number(request.nextUrl.searchParams.get("limit") || 8)
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
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    await ensureUser(userId)
    await connectMongoWithRetry()

    const body = (await request.json().catch(() => ({}))) as {
      notificationId?: string
      markAll?: boolean
    }

    if (body.markAll) {
      const result = await markAllNotificationsAsRead(userId)
      return NextResponse.json({ success: true, markedCount: result.markedCount })
    }

    if (!body.notificationId || !Types.ObjectId.isValid(body.notificationId)) {
      return NextResponse.json(
        { success: false, error: "A valid notificationId is required" },
        { status: 400 },
      )
    }

    const result = await markNotificationAsRead(userId, body.notificationId)

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