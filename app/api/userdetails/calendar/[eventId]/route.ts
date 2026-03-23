import { Types } from "mongoose"
import { NextRequest, NextResponse } from "next/server"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import { enforceRateLimit, requireUserContext } from "@/app/api/lib/routeGuards"
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
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const userContext = await requireUserContext()
    if (userContext instanceof NextResponse) {
      return userContext
    }

    const userId = userContext.clerkUid

    const { blockedResponse } = enforceRateLimit(request, {
      key: `userdetails:calendar:event:get:${userId}`,
      max: 120,
      windowMs: 10 * 60 * 1000,
    })

    if (blockedResponse) {
      return blockedResponse
    }

    const eventId = await getEventId(params)
    if (!isValidObjectId(eventId)) {
      return NextResponse.json({ success: false, error: "Invalid eventId" }, { status: 400 })
    }

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
    const userContext = await requireUserContext()
    if (userContext instanceof NextResponse) {
      return userContext
    }

    const userId = userContext.clerkUid

    const { blockedResponse } = enforceRateLimit(request, {
      key: `userdetails:calendar:event:put:${userId}`,
      max: 90,
      windowMs: 10 * 60 * 1000,
    })

    if (blockedResponse) {
      return blockedResponse
    }

    const eventId = await getEventId(params)
    if (!isValidObjectId(eventId)) {
      return NextResponse.json({ success: false, error: "Invalid eventId" }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
    }

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

    if (!("event" in result)) {
      return NextResponse.json({ success: false, error: "Invalid calendar event payload" }, { status: 400 })
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
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const userContext = await requireUserContext()
    if (userContext instanceof NextResponse) {
      return userContext
    }

    const userId = userContext.clerkUid

    const { blockedResponse } = enforceRateLimit(request, {
      key: `userdetails:calendar:event:delete:${userId}`,
      max: 90,
      windowMs: 10 * 60 * 1000,
    })

    if (blockedResponse) {
      return blockedResponse
    }

    const eventId = await getEventId(params)
    if (!isValidObjectId(eventId)) {
      return NextResponse.json({ success: false, error: "Invalid eventId" }, { status: 400 })
    }

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
