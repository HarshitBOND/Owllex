import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import { ensureUser } from "@/app/api/lib/ensureUser"
import {
  createManualCalendarEvent,
  listCalendarEventsForUser,
  syncCalendarEventsForUser,
} from "@/app/api/lib/services/calendar"

export async function GET() {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    await ensureUser(userId)
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
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
    }

    await ensureUser(userId)
    await connectMongoWithRetry()

    const result = await createManualCalendarEvent(userId, body)
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
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
