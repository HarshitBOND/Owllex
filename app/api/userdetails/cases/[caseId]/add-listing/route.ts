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
import { formatDateKey, parseCourtDate } from "@/lib/hearingDates"

const addListingSchema = z.object({
  date: z.string().trim().min(1, "Listing date is required"),
  listingDetails: z.string().trim().min(3, "Listing details are required").max(2000, "Listing details are too long"),
  setAsCourtDate: z.boolean().optional(),
})

const getCaseId = async (params: Promise<{ caseId: string }>) => {
  const { caseId } = await params
  return caseId
}

const isValidObjectId = (value: string) => Types.ObjectId.isValid(value)

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
    if (!isValidObjectId(caseId)) {
      return NextResponse.json({ success: false, error: "Invalid caseId" }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
    }

    const parsedPayload = addListingSchema.safeParse(body)
    if (!parsedPayload.success) {
      const firstIssue = parsedPayload.error.issues[0]?.message || "Invalid listing payload"
      return NextResponse.json({ success: false, error: firstIssue }, { status: 400 })
    }

    const parsedDate = parseCourtDate(parsedPayload.data.date)
    if (!parsedDate) {
      return NextResponse.json({ success: false, error: "Invalid listing date" }, { status: 400 })
    }

    const normalizedDate = formatDateKey(parsedDate)
    const shouldUpdateCourtDate = parsedPayload.data.setAsCourtDate ?? true

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

    const existingListings = Array.isArray(caseFound.listingDetails)
      ? (caseFound.listingDetails as Array<{ srlNo?: string }>)
      : []

    const listing = {
      srlNo: getNextSerialNumber(existingListings),
      date: normalizedDate,
      listingDetails: parsedPayload.data.listingDetails.trim(),
    }

    caseFound.listingDetails.unshift(listing)

    const previousCourtDate = normalizeCourtDateValue(caseFound.courtDate)

    appendCourtDateChange({
      caseDocument: caseFound,
      nextCourtDate: normalizedDate,
      previousCourtDate,
      reason: shouldUpdateCourtDate
        ? "Court date updated from listing entry"
        : "Listing added without changing primary court date",
      listingDetails: parsedPayload.data.listingDetails,
      changedByClerkUid: userId,
      source: "listing",
      type: "listing-added",
    })

    if (shouldUpdateCourtDate) {
      caseFound.courtDate = normalizedDate
    }

    await caseFound.save()

    if (shouldUpdateCourtDate) {
      await reconcileNotificationsForCase(caseId, normalizedDate)
      await syncCalendarEventsForUser(userId)
    }

    return NextResponse.json({
      success: true,
      listing,
      listingDetails: caseFound.listingDetails,
      courtDate: caseFound.courtDate,
    })
  } catch (error) {
    console.error("Add listing error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to add listing" },
      { status: 500 },
    )
  }
}