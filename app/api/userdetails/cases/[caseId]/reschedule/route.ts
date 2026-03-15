import { auth } from "@clerk/nextjs/server"
import { Types } from "mongoose"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import { ensureUser } from "@/app/api/lib/ensureUser"
import Case from "@/app/api/lib/models/case"
import User from "@/app/api/lib/models/user"
import { syncCalendarEventsForUser } from "@/app/api/lib/services/calendar"
import { appendCourtDateChange, normalizeCourtDateValue } from "@/app/api/lib/services/caseHearing"
import { reconcileNotificationsForCase } from "@/app/api/lib/services/notifications"

const rescheduleSchema = z.object({
  newCourtDate: z.string().trim().min(1, "New court date is required"),
  reason: z.string().trim().max(500, "Reason is too long").optional(),
  listingDetails: z.string().trim().max(2000, "Listing details are too long").optional(),
})

const getCaseId = async (params: Promise<{ caseId: string }>) => {
  const { caseId } = await params
  return caseId
}

const getNextSerialNumber = (listings: Array<{ srlNo?: string }>) => {
  const numericSerials = listings
    .map((listing) => Number(listing?.srlNo))
    .filter((value) => Number.isFinite(value)) as number[]

  if (numericSerials.length > 0) {
    return String(Math.max(...numericSerials) + 1)
  }

  return String(listings.length + 1)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const caseId = await getCaseId(params)
    if (!Types.ObjectId.isValid(caseId)) {
      return NextResponse.json({ success: false, error: "Invalid caseId" }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
    }

    const parsedPayload = rescheduleSchema.safeParse(body)
    if (!parsedPayload.success) {
      const firstIssue = parsedPayload.error.issues[0]?.message || "Invalid reschedule payload"
      return NextResponse.json({ success: false, error: firstIssue }, { status: 400 })
    }

    const normalizedNewCourtDate = normalizeCourtDateValue(parsedPayload.data.newCourtDate)
    if (!normalizedNewCourtDate) {
      return NextResponse.json({ success: false, error: "Invalid new court date" }, { status: 400 })
    }

    await ensureUser(userId)
    await connectMongoWithRetry()

    const isOwnedCase = await User.exists({ clerkUid: userId, cases: caseId })
    if (!isOwnedCase) {
      return NextResponse.json({ success: false, error: "Case not found" }, { status: 404 })
    }

    const caseFound = await Case.findById(caseId)
    if (!caseFound) {
      return NextResponse.json({ success: false, error: "Case not found" }, { status: 404 })
    }

    const previousCourtDate = normalizeCourtDateValue(caseFound.courtDate)
    const details = parsedPayload.data.listingDetails?.trim() || ""
    const reason = parsedPayload.data.reason?.trim() || "Rescheduled hearing date"

    if (previousCourtDate !== normalizedNewCourtDate) {
      caseFound.courtDate = normalizedNewCourtDate
    }

    const existingListings = Array.isArray(caseFound.listingDetails)
      ? (caseFound.listingDetails as Array<{ srlNo?: string }>)
      : []

    caseFound.listingDetails.unshift({
      srlNo: getNextSerialNumber(existingListings),
      date: normalizedNewCourtDate,
      listingDetails: details || reason,
    })

    appendCourtDateChange({
      caseDocument: caseFound,
      nextCourtDate: normalizedNewCourtDate,
      previousCourtDate,
      reason,
      listingDetails: details || reason,
      changedByClerkUid: userId,
      source: "reschedule",
      type: "rescheduled",
    })

    await caseFound.save()

    await reconcileNotificationsForCase(caseId, normalizedNewCourtDate)
    await syncCalendarEventsForUser(userId)

    return NextResponse.json({
      success: true,
      courtDate: caseFound.courtDate,
      latestHearingEntry: Array.isArray(caseFound.hearingHistory) ? caseFound.hearingHistory[0] : null,
      listingDetails: caseFound.listingDetails,
    })
  } catch (error) {
    console.error("Case reschedule error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to reschedule case" },
      { status: 500 },
    )
  }
}
