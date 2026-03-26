import { NextRequest, NextResponse } from "next/server"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import { enforceRateLimit, requireUserContext } from "@/app/api/lib/routeGuards"
import {
  createManualCalendarEvent,
  listCalendarEventsForUser,
  syncCalendarEventsForUser,
} from "@/app/api/lib/services/calendar"

export async function GET(request: NextRequest) {
  try {
    const userContext = await requireUserContext()
    if (userContext instanceof NextResponse) {
      return userContext
    }

    const userId = userContext.clerkUid

    const { blockedResponse } = await enforceRateLimit(request, {
      key: `userdetails:calendar:get:${userId}`,
      max: 180,
      windowMs: 10 * 60 * 1000,
    })

    if (blockedResponse) {
      return blockedResponse
    }

    await connectMongoWithRetry()
    await syncCalendarEventsForUser(userId)

    const events = await listCalendarEventsForUser(userId)

    return NextResponse.json({ success: true, events })
  } catch (error) {
    console.error("Calendar GET error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to load calendar events" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const userContext = await requireUserContext()
    if (userContext instanceof NextResponse) {
      return userContext
    }

    const userId = userContext.clerkUid

    const { blockedResponse } = await enforceRateLimit(request, {
      key: `userdetails:calendar:post:${userId}`,
      max: 60,
      windowMs: 10 * 60 * 1000,
    })

    if (blockedResponse) {
      return blockedResponse
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
    }

    await connectMongoWithRetry()

    const result = await createManualCalendarEvent(userId, body)
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    if (!("event" in result)) {
      return NextResponse.json({ success: false, error: "Invalid calendar event payload" }, { status: 400 })
    }

    return NextResponse.json({ success: true, event: result.event }, { status: 201 })
  } catch (error) {
    console.error("Calendar POST error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create calendar event" },
      { status: 500 },
    )
  }
}
