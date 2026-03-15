import { auth } from "@clerk/nextjs/server"
import { Types } from "mongoose"
import { NextRequest, NextResponse } from "next/server"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import { ensureUser } from "@/app/api/lib/ensureUser"
import {
  deleteManualCalendarEvent,
  getCalendarEventForUser,
  updateManualCalendarEvent,
} from "@/app/api/lib/services/calendar"

const getEventId = async (params: Promise<{ eventId: string }>) => {
  const { eventId } = await params
  return eventId
}

const isValidObjectId = (value: string) => Types.ObjectId.isValid(value)

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const eventId = await getEventId(params)
    if (!isValidObjectId(eventId)) {
      return NextResponse.json({ success: false, error: "Invalid eventId" }, { status: 400 })
    }

    await ensureUser(userId)
    await connectMongoWithRetry()

    const event = await getCalendarEventForUser(userId, eventId)
    if (!event) {
      return NextResponse.json({ success: false, error: "Event not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true, event })
  } catch (error) {
    console.error("Calendar event GET error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to load calendar event" },
      { status: 500 },
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const eventId = await getEventId(params)
    if (!isValidObjectId(eventId)) {
      return NextResponse.json({ success: false, error: "Invalid eventId" }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
    }

    await ensureUser(userId)
    await connectMongoWithRetry()

    const result = await updateManualCalendarEvent(userId, eventId, body)
    if (!result.success) {
      if ("error" in result) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 })
      }

      return NextResponse.json(
        {
          success: false,
          error: result.reason === "locked" ? "Synced events cannot be edited manually" : "Event not found",
        },
        { status: result.reason === "locked" ? 409 : 404 },
      )
    }

    return NextResponse.json({ success: true, event: result.event })
  } catch (error) {
    console.error("Calendar event PUT error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update calendar event" },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const eventId = await getEventId(params)
    if (!isValidObjectId(eventId)) {
      return NextResponse.json({ success: false, error: "Invalid eventId" }, { status: 400 })
    }

    await ensureUser(userId)
    await connectMongoWithRetry()

    const result = await deleteManualCalendarEvent(userId, eventId)
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.reason === "locked" ? "Synced events cannot be deleted manually" : "Event not found",
        },
        { status: result.reason === "locked" ? 409 : 404 },
      )
    }

    return NextResponse.json({ success: true, event: result.event })
  } catch (error) {
    console.error("Calendar event DELETE error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete calendar event" },
      { status: 500 },
    )
  }
}
