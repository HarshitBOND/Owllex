import Case from "@/app/api/lib/models/case"
import ScrapedCase from "@/app/api/lib/models/scraped-case"
import User from "@/app/api/lib/models/user"
import { appendCourtDateChange, normalizeCourtDateValue } from "@/app/api/lib/services/caseHearing"
import { reconcileNotificationsForCase } from "@/app/api/lib/services/notifications"
import { syncCalendarEventsForUsers } from "@/app/api/lib/services/calendar"
import { parseCourtDate, formatDateKey } from "@/lib/hearingDates"
import { buildSubscriptionSummaryFromUserRecord } from "@/app/api/lib/services/subscription"
import { getBackendInternalHeaders } from "@/app/api/lib/backendInternalAuth"

type ScraperAutomationOptions = {
  triggerCourtDownload?: boolean
  daysBack?: number
  autoDeletePdfs?: boolean
  startFromCheckpoint?: boolean
  waitForImportCompletion?: boolean
  maxImportPolls?: number
  importPollIntervalMs?: number
}

type ImportTriggerResult = {
  success: boolean
  importId: string | null
  status: "started" | "completed" | "failed" | "skipped"
  error: string | null
  summary: Record<string, unknown> | null
}

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || "http://localhost:8000"

const AUTOMATION_ACTIVE_STATUSES = new Set(["active", "trial", "past_due"])

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const normalizeCaseNumber = (value?: string | null) => {
  if (!value) {
    return ""
  }

  return value.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9./()-]/g, "")
}

const getNextListingSerialNumber = (listings: Array<{ srlNo?: string }>) => {
  const numericSerials = listings
    .map((listing) => Number(listing?.srlNo))
    .filter((serial): serial is number => Number.isFinite(serial))

  if (numericSerials.length > 0) {
    return String(Math.max(...numericSerials) + 1)
  }

  return String(listings.length + 1)
}

const getScrapedCourtDate = (scraped: any) => {
  const parsedListDate = parseCourtDate(scraped?.list_date || null)
  if (parsedListDate) {
    return formatDateKey(parsedListDate)
  }

  if (scraped?.pdf_date) {
    const parsedPdfDate = new Date(scraped.pdf_date)
    if (!Number.isNaN(parsedPdfDate.getTime())) {
      return formatDateKey(parsedPdfDate)
    }
  }

  if (scraped?.parsed_at) {
    const parsedAt = new Date(scraped.parsed_at)
    if (!Number.isNaN(parsedAt.getTime())) {
      return formatDateKey(parsedAt)
    }
  }

  return null
}

const buildAutoListingDetails = (scraped: any) => {
  const details = [
    "Auto-synced from Delhi High Court cause list",
    scraped?.list_date ? `Date: ${scraped.list_date}` : null,
    scraped?.court_no ? `Court: ${scraped.court_no}` : null,
    scraped?.judge ? `Judge: ${scraped.judge}` : null,
  ].filter(Boolean)

  return details.join(" | ")
}

async function triggerBulkImport(options: ScraperAutomationOptions): Promise<ImportTriggerResult> {
  if (!options.triggerCourtDownload) {
    return {
      success: true,
      importId: null,
      status: "skipped",
      error: null,
      summary: null,
    }
  }

  try {
    const triggerResponse = await fetch(`${BACKEND_API}/api/v1/scraper/parse-causelist-bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getBackendInternalHeaders(),
      },
      body: JSON.stringify({
        days_back: options.daysBack ?? 3,
        auto_delete_pdfs: options.autoDeletePdfs ?? true,
        start_from_checkpoint: options.startFromCheckpoint ?? true,
      }),
    })

    const triggerJson = (await triggerResponse.json().catch(() => null)) as Record<string, unknown> | null

    if (!triggerResponse.ok || !triggerJson?.import_id) {
      return {
        success: false,
        importId: null,
        status: "failed",
        error: String(triggerJson?.error || "Failed to trigger bulk causelist import"),
        summary: triggerJson,
      }
    }

    const importId = String(triggerJson.import_id)

    if (!options.waitForImportCompletion) {
      return {
        success: true,
        importId,
        status: "started",
        error: null,
        summary: triggerJson,
      }
    }

    const maxPolls = Math.max(1, options.maxImportPolls ?? 20)
    const pollIntervalMs = Math.max(500, options.importPollIntervalMs ?? 2000)

    for (let pollIndex = 0; pollIndex < maxPolls; pollIndex += 1) {
      await wait(pollIntervalMs)

      const progressResponse = await fetch(
        `${BACKEND_API}/api/v1/scraper/progress/${encodeURIComponent(importId)}`,
        {
          method: "GET",
          headers: getBackendInternalHeaders(),
        },
      )

      const progressJson = (await progressResponse.json().catch(() => null)) as
        | Record<string, unknown>
        | null

      const status = typeof progressJson?.status === "string" ? progressJson.status : "running"

      if (status === "completed") {
        return {
          success: true,
          importId,
          status: "completed",
          error: null,
          summary: (progressJson?.summary as Record<string, unknown>) || progressJson,
        }
      }

      if (status === "failed") {
        return {
          success: false,
          importId,
          status: "failed",
          error: String(progressJson?.error || "Bulk causelist import failed"),
          summary: progressJson,
        }
      }
    }

    return {
      success: true,
      importId,
      status: "started",
      error: null,
      summary: {
        message: "Import still running after polling window",
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reach parser backend"
    return {
      success: false,
      importId: null,
      status: "failed",
      error: message,
      summary: null,
    }
  }
}

export async function runScraperAutoMatch() {
  const users = await User.find({ clerkUid: { $exists: true, $ne: null } })
    .select("_id clerkUid subscription cases")
    .populate({
      path: "cases",
      select: "_id caseNo caseTitle courtDate listingDetails hearingHistory courtDateAuditTrail",
    })
    .lean()
    .exec()

  const automationUsers = (users as any[]).filter((user) => {
    const subscription = buildSubscriptionSummaryFromUserRecord({
      subscription: user.subscription,
      cases: user.cases,
    })

    return subscription.features.advancedAutomation && AUTOMATION_ACTIVE_STATUSES.has(subscription.status)
  })

  const caseNumberSet = new Set<string>()

  for (const user of automationUsers) {
    const caseRecords = Array.isArray(user.cases) ? user.cases : []

    for (const caseRecord of caseRecords) {
      const normalizedCaseNumber = normalizeCaseNumber(caseRecord?.caseNo)
      if (normalizedCaseNumber) {
        caseNumberSet.add(normalizedCaseNumber)
      }
    }
  }

  if (caseNumberSet.size === 0) {
    return {
      usersConsidered: automationUsers.length,
      matchedCases: 0,
      updatedCases: 0,
      touchedUsers: 0,
    }
  }

  const scrapedRows = await ScrapedCase.find({ parsed_at: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } })
    .select("main_case_no list_date court_no judge parsed_at pdf_date")
    .sort({ parsed_at: -1 })
    .lean()
    .exec()

  const scrapedMap = new Map<string, any>()

  for (const row of scrapedRows as any[]) {
    const normalized = normalizeCaseNumber(row.main_case_no)
    if (!normalized || scrapedMap.has(normalized)) {
      continue
    }

    scrapedMap.set(normalized, row)
  }

  let matchedCases = 0
  let updatedCases = 0
  const touchedUserSet = new Set<string>()

  for (const user of automationUsers) {
    const clerkUid = String(user.clerkUid || "")
    if (!clerkUid) {
      continue
    }

    const caseRecords = Array.isArray(user.cases) ? user.cases : []

    for (const caseRecord of caseRecords as any[]) {
      const normalizedCaseNumber = normalizeCaseNumber(caseRecord?.caseNo)
      if (!normalizedCaseNumber) {
        continue
      }

      const scraped = scrapedMap.get(normalizedCaseNumber)
      if (!scraped) {
        continue
      }

      matchedCases += 1

      const nextCourtDate = getScrapedCourtDate(scraped)
      if (!nextCourtDate) {
        continue
      }

      const previousCourtDate = normalizeCourtDateValue(caseRecord.courtDate)
      if (previousCourtDate === nextCourtDate) {
        continue
      }

      const caseDoc = await Case.findById(caseRecord._id)
      if (!caseDoc) {
        continue
      }

      caseDoc.courtDate = nextCourtDate

      const existingListings = Array.isArray(caseDoc.listingDetails)
        ? (caseDoc.listingDetails as Array<{ srlNo?: string; date?: string; listingDetails?: string }>)
        : []

      caseDoc.listingDetails = existingListings
      caseDoc.listingDetails.unshift({
        srlNo: getNextListingSerialNumber(existingListings),
        date: nextCourtDate,
        listingDetails: buildAutoListingDetails(scraped),
      })

      appendCourtDateChange({
        caseDocument: caseDoc,
        nextCourtDate,
        previousCourtDate,
        reason: "Auto-synced from scraped cause list",
        listingDetails: buildAutoListingDetails(scraped),
        changedByClerkUid: clerkUid,
        source: "automation",
        type: "updated",
      })

      await caseDoc.save()
      await reconcileNotificationsForCase(caseDoc._id.toString(), nextCourtDate)

      touchedUserSet.add(clerkUid)
      updatedCases += 1
    }
  }

  if (touchedUserSet.size > 0) {
    await syncCalendarEventsForUsers(Array.from(touchedUserSet))
  }

  return {
    usersConsidered: automationUsers.length,
    matchedCases,
    updatedCases,
    touchedUsers: touchedUserSet.size,
  }
}

export async function runScraperAutomationWorkflow(options: ScraperAutomationOptions = {}) {
  const importResult = await triggerBulkImport(options)

  const autoMatchSummary = await runScraperAutoMatch()

  return {
    import: importResult,
    autoMatch: autoMatchSummary,
  }
}
