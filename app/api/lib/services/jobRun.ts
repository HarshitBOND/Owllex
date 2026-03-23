import JobRun from "@/app/api/lib/models/job-run"

export type JobRunStatus = "running" | "success" | "partial" | "failed"
export type JobRunTrigger = "cron" | "manual" | "api"

export async function startJobRun({
  jobName,
  trigger,
  metadata,
}: {
  jobName: string
  trigger: JobRunTrigger
  metadata?: Record<string, unknown>
}) {
  const run = await JobRun.create({
    jobName,
    trigger,
    status: "running",
    startedAt: new Date(),
    metadata: metadata || {},
  })

  return run
}

export async function completeJobRun({
  runId,
  status,
  summary,
}: {
  runId: string
  status: Exclude<JobRunStatus, "running">
  summary?: Record<string, unknown>
}) {
  const finishedAt = new Date()
  const run = (await JobRun.findById(runId).select("startedAt").lean().exec()) as any
  const startedAt = run?.startedAt ? new Date(run.startedAt) : null

  await JobRun.updateOne(
    { _id: runId },
    {
      $set: {
        status,
        finishedAt,
        durationMs: startedAt ? Math.max(finishedAt.getTime() - startedAt.getTime(), 0) : null,
        summary: summary || {},
      },
    },
  ).exec()
}

export async function failJobRun({
  runId,
  error,
  summary,
}: {
  runId: string
  error: unknown
  summary?: Record<string, unknown>
}) {
  const errorMessage =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown job failure"

  const finishedAt = new Date()
  const run = (await JobRun.findById(runId).select("startedAt").lean().exec()) as any
  const startedAt = run?.startedAt ? new Date(run.startedAt) : null

  await JobRun.updateOne(
    { _id: runId },
    {
      $set: {
        status: "failed",
        finishedAt,
        durationMs: startedAt ? Math.max(finishedAt.getTime() - startedAt.getTime(), 0) : null,
        summary: summary || {},
        errorMessage,
      },
    },
  ).exec()
}

export async function listRecentJobRuns({
  jobNames,
  limit = 20,
}: {
  jobNames?: string[]
  limit?: number
}) {
  const query = Array.isArray(jobNames) && jobNames.length > 0 ? { jobName: { $in: jobNames } } : {}

  const rows = await JobRun.find(query)
    .select("jobName trigger status startedAt finishedAt durationMs summary errorMessage")
    .sort({ startedAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .lean()
    .exec()

  return (rows as any[]).map((row) => ({
    id: row._id.toString(),
    jobName: row.jobName,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : null,
    finishedAt: row.finishedAt ? new Date(row.finishedAt).toISOString() : null,
    durationMs: typeof row.durationMs === "number" ? row.durationMs : null,
    summary: row.summary || {},
    errorMessage: row.errorMessage || "",
  }))
}
