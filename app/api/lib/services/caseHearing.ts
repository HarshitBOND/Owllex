import { formatDateKey, parseCourtDate } from "@/lib/hearingDates"

export type CourtDateChangeSource = "case-create" | "listing" | "reschedule" | "manual"
export type CourtDateChangeType = "created" | "listing-added" | "rescheduled" | "updated"

export const normalizeCourtDateValue = (value?: string | null) => {
  if (!value) {
    return null
  }

  const parsedDate = parseCourtDate(value)
  if (!parsedDate) {
    return null
  }

  return formatDateKey(parsedDate)
}

export const appendCourtDateChange = ({
  caseDocument,
  nextCourtDate,
  previousCourtDate,
  reason,
  listingDetails,
  changedByClerkUid,
  source,
  type,
}: {
  caseDocument: {
    hearingHistory?: Array<Record<string, unknown>>
    courtDateAuditTrail?: Array<Record<string, unknown>>
  }
  nextCourtDate: string
  previousCourtDate?: string | null
  reason?: string | null
  listingDetails?: string | null
  changedByClerkUid?: string | null
  source: CourtDateChangeSource
  type: CourtDateChangeType
}) => {
  if (!Array.isArray(caseDocument.hearingHistory)) {
    caseDocument.hearingHistory = []
  }

  if (!Array.isArray(caseDocument.courtDateAuditTrail)) {
    caseDocument.courtDateAuditTrail = []
  }

  const changeReason = reason?.trim() || ""
  const details = listingDetails?.trim() || ""
  const actor = changedByClerkUid?.trim() || null
  const normalizedPreviousDate = previousCourtDate || null
  const changedAt = new Date()

  const latestHistory = caseDocument.hearingHistory[0]
  if (
    latestHistory &&
    latestHistory.hearingDate === nextCourtDate &&
    latestHistory.previousCourtDate === normalizedPreviousDate &&
    latestHistory.type === type
  ) {
    return
  }

  caseDocument.hearingHistory.unshift({
    type,
    hearingDate: nextCourtDate,
    previousCourtDate: normalizedPreviousDate,
    listingDetails: details,
    reason: changeReason,
    source,
    changedByClerkUid: actor,
    changedAt,
  })

  caseDocument.courtDateAuditTrail.unshift({
    previousCourtDate: normalizedPreviousDate,
    nextCourtDate,
    reason: changeReason,
    source,
    changedByClerkUid: actor,
    changedAt,
  })
}
