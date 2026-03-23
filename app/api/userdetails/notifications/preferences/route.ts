import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import { enforceRateLimit, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards"
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

export async function GET(request: NextRequest) {
  try {
    const userContext = await requireUserContext()
    if (userContext instanceof NextResponse) {
      return userContext
    }

    const userId = userContext.clerkUid

    const { blockedResponse } = enforceRateLimit(request, {
      key: `userdetails:notifications:preferences:get:${userId}`,
      max: 120,
      windowMs: 10 * 60 * 1000,
    })

    if (blockedResponse) {
      return blockedResponse
    }

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
    const userContext = await requireUserContext()
    if (userContext instanceof NextResponse) {
      return userContext
    }

    const userId = userContext.clerkUid

    const { blockedResponse } = enforceRateLimit(request, {
      key: `userdetails:notifications:preferences:patch:${userId}`,
      max: 90,
      windowMs: 10 * 60 * 1000,
    })

    if (blockedResponse) {
      return blockedResponse
    }

    await connectMongoWithRetry()

    const parsedBody = await parseAndValidateJson(request, updatePreferencesSchema)
    if (!parsedBody.success) {
      return parsedBody.response
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
