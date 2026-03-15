import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import { ensureUser } from "@/app/api/lib/ensureUser"
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/app/api/lib/services/notifications"

const updatePreferencesSchema = z
  .object({
    emailEnabled: z.boolean().optional(),
    timezone: z.string().trim().min(1).max(100).optional(),
    sendWindowStartHour: z.number().int().min(0).max(23).optional(),
    sendWindowEndHour: z.number().int().min(1).max(24).optional(),
    reminderOffsets: z.array(z.union([z.literal(1), z.literal(3), z.literal(7)])).max(3).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one preference field is required",
  })

export async function GET() {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    await ensureUser(userId)
    await connectMongoWithRetry()

    const preferences = await getNotificationPreferences(userId)

    return NextResponse.json({
      success: true,
      preferences,
    })
  } catch (error) {
    console.error("Notification preferences GET error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch notification preferences" },
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

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
    }

    const parsedBody = updatePreferencesSchema.safeParse(body)
    if (!parsedBody.success) {
      const firstIssue = parsedBody.error.issues[0]?.message || "Invalid notification preferences payload"
      return NextResponse.json({ success: false, error: firstIssue }, { status: 400 })
    }

    const preferences = await updateNotificationPreferences(userId, parsedBody.data)

    return NextResponse.json({
      success: true,
      preferences,
    })
  } catch (error) {
    console.error("Notification preferences PATCH error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update notification preferences" },
      { status: 500 },
    )
  }
}
