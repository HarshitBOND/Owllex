import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import { hasValidCronSecret } from "@/app/api/lib/services/notificationRunnerAuth"
import { requireAdmin } from "@/app/api/lib/adminMiddleware"
import { runScraperAutomationWorkflow } from "@/app/api/lib/services/scraperAutomation"
import { completeJobRun, failJobRun, startJobRun } from "@/app/api/lib/services/jobRun"
import { enforceRateLimit } from "@/app/api/lib/routeGuards"

const automationRequestSchema = z
  .object({
    triggerCourtDownload: z.boolean().optional(),
    daysBack: z.number().int().min(1).max(30).optional(),
    autoDeletePdfs: z.boolean().optional(),
    startFromCheckpoint: z.boolean().optional(),
    waitForImportCompletion: z.boolean().optional(),
    maxImportPolls: z.number().int().min(1).max(120).optional(),
    importPollIntervalMs: z.number().int().min(500).max(30000).optional(),
  })
  .partial()

const resolveAuthorization = async (request: NextRequest) => {
  const cronAuthorized = hasValidCronSecret({
    configuredSecret: process.env.CRON_SECRET,
    secretHeader: request.headers.get("x-cron-secret"),
    authorizationHeader: request.headers.get("authorization"),
  })

  if (cronAuthorized) {
    return {
      authorized: true,
      trigger: "cron" as const,
      actor: "cron",
      errorResponse: null as NextResponse | null,
    }
  }

  const admin = await requireAdmin(request)
  if (admin instanceof NextResponse) {
    return {
      authorized: false,
      trigger: "api" as const,
      actor: "anonymous",
      errorResponse: admin,
    }
  }

  return {
    authorized: true,
    trigger: "manual" as const,
    actor: admin.userId,
    errorResponse: null,
  }
}

const runAutomation = async (request: NextRequest, options: Record<string, unknown>) => {
  const authorization = await resolveAuthorization(request)
  if (!authorization.authorized && authorization.errorResponse) {
    return authorization.errorResponse
  }

  const { blockedResponse } = enforceRateLimit(request, {
    key: "internal:scraper:automation",
    max: 30,
    windowMs: 5 * 60 * 1000,
  })

  if (blockedResponse) {
    return blockedResponse
  }

  await connectMongoWithRetry()

  const run = await startJobRun({
    jobName: "scraper-automation",
    trigger: authorization.trigger === "cron" ? "cron" : "manual",
    metadata: {
      actor: authorization.actor,
    },
  })

  try {
    const result = await runScraperAutomationWorkflow(options)

    const finalStatus = result.import.success ? "success" : "partial"

    await completeJobRun({
      runId: run._id.toString(),
      status: finalStatus,
      summary: result as Record<string, unknown>,
    })

    return NextResponse.json({
      success: true,
      runId: run._id,
      summary: result,
      status: finalStatus,
    })
  } catch (error) {
    await failJobRun({
      runId: run._id.toString(),
      error,
    })

    console.error("Scraper automation error:", error)

    return NextResponse.json(
      {
        success: false,
        runId: run._id,
        error: "Failed to run scraper automation workflow",
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = automationRequestSchema.safeParse(body)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message || "Invalid automation payload"
    return NextResponse.json({ success: false, error: issue }, { status: 400 })
  }

  return runAutomation(request, {
    triggerCourtDownload: parsed.data.triggerCourtDownload ?? true,
    daysBack: parsed.data.daysBack ?? 3,
    autoDeletePdfs: parsed.data.autoDeletePdfs ?? true,
    startFromCheckpoint: parsed.data.startFromCheckpoint ?? true,
    waitForImportCompletion: parsed.data.waitForImportCompletion ?? true,
    maxImportPolls: parsed.data.maxImportPolls ?? 20,
    importPollIntervalMs: parsed.data.importPollIntervalMs ?? 2000,
  })
}

export async function GET(request: NextRequest) {
  return runAutomation(request, {
    triggerCourtDownload: true,
    daysBack: 2,
    autoDeletePdfs: true,
    startFromCheckpoint: true,
    waitForImportCompletion: false,
    maxImportPolls: 8,
    importPollIntervalMs: 2000,
  })
}
