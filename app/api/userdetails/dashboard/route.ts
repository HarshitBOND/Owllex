import { NextRequest, NextResponse } from "next/server"
import Case from "../../lib/models/case"
import Client from "../../lib/models/client"
import User from "../../lib/models/user"
import Task from "../../lib/models/task"
import SimpleInvoice from "../../lib/models/simple-invoice"
import Transaction from "../../lib/models/transaction"
import connectMongoWithRetry from "../../lib/db/connectMongo"
import { ensureUser } from "../../lib/ensureUser"
import { parseCourtDate, toClientDateTimeIso } from "@/lib/hearingDates"
import { ensureUserSubscriptionDefaults, getUserSubscriptionSummary } from "../../lib/services/subscription"
import { requireUserContext } from "@/app/api/lib/routeGuards"
import { listRecentJobRuns } from "@/app/api/lib/services/jobRun"

const TaskModel: any = Task

const toDateFromObjectId = (value: unknown) => {
  if (!value || typeof value !== "object") {
    return null
  }

  const idValue = (value as { toString?: () => string }).toString?.()
  if (!idValue || idValue.length < 8) {
    return null
  }

  const timestamp = Number.parseInt(idValue.slice(0, 8), 16)
  if (!Number.isFinite(timestamp)) {
    return null
  }

  return new Date(timestamp * 1000)
}

const getBestRecordDate = (record: Record<string, unknown>) => {
  const createdAt = record.createdAt ? new Date(record.createdAt as string) : null
  if (createdAt && !Number.isNaN(createdAt.getTime())) {
    return createdAt
  }

  const updatedAt = record.updatedAt ? new Date(record.updatedAt as string) : null
  if (updatedAt && !Number.isNaN(updatedAt.getTime())) {
    return updatedAt
  }

  return toDateFromObjectId(record._id) || new Date()
}

const clampAmount = (value: number) => Number(value.toFixed(2))

const buildActivityItem = ({
  type,
  title,
  subtitle,
  at,
  href,
  status,
}: {
  type: "case" | "client" | "task" | "invoice" | "transaction"
  title: string
  subtitle: string
  at: Date
  href: string
  status: "info" | "success" | "warning" | "error"
}) => ({
  type,
  title,
  subtitle,
  at: at.toISOString(),
  href,
  status,
})

export async function GET(_req: NextRequest) {
  try {
    const userContext = await requireUserContext()
    if (userContext instanceof NextResponse) {
      return userContext
    }

    const userId = userContext.clerkUid

    await ensureUser(userId)
    await ensureUserSubscriptionDefaults(userId)
    await connectMongoWithRetry()

    const user = await User.findOne({ clerkUid: userId })
      .select("_id cases clients subscription")
      .lean()
      .exec()

    const subscription = await getUserSubscriptionSummary(userId)

    if (!user) {
      return NextResponse.json({
        stats: {
          totalCases: 0,
          totalClients: 0,
          pendingTasks: 0,
          completedTasks: 0,
          upcomingHearings: 0,
        },
        recentCases: [],
        recentClients: [],
        upcomingHearings: [],
        recentTasks: [],
        subscription,
        analytics: {
          overdueTasks: 0,
          tasksDueNext7Days: 0,
          hearingsNext30Days: 0,
          outstandingInvoices: 0,
          overdueInvoices: 0,
          recentFailedTransactions: 0,
        },
        billing: {
          totalOutstanding: 0,
          overdueOutstanding: 0,
          collectedThisMonth: 0,
          openBillingIssues: 0,
          recentTransactions: [],
        },
        activityFeed: [],
        operations: {
          automationEnabled: false,
          recentJobs: [],
        },
      })
    }

    const typedUser = user as Record<string, any>
    const caseIds = Array.isArray(typedUser.cases) ? typedUser.cases : []
    const clientIds = Array.isArray(typedUser.clients) ? typedUser.clients : []

    const [caseRows, clientRows, taskRows, completedTaskCount, invoices, recentTransactions, recentFailedTransactions, recentJobRuns] =
      await Promise.all([
        caseIds.length > 0
          ? Case.find({ _id: { $in: caseIds } })
              .select("_id caseNo caseTitle courtName courtDate status createdAt updatedAt")
              .lean()
              .exec()
          : Promise.resolve([]),
        clientIds.length > 0
          ? Client.find({ _id: { $in: clientIds } })
              .select("_id name email contact createdAt updatedAt")
              .lean()
              .exec()
          : Promise.resolve([]),
        TaskModel.find({ clerkUid: userId, status: "pending" })
          .select("_id task status dueDate updatedAt createdAt")
          .lean()
          .exec(),
        TaskModel.countDocuments({ clerkUid: userId, status: "completed" }),
        SimpleInvoice.find({ clerkUid: userId })
          .select(
            "_id invoiceNumber clientName status issueDate dueDate total paidAmount currency createdAt updatedAt supportIssueStatus",
          )
          .sort({ updatedAt: -1 })
          .lean()
          .exec(),
        Transaction.find({ userId: typedUser._id })
          .select("_id status amount currency description createdAt supportIssueStatus")
          .sort({ createdAt: -1 })
          .limit(6)
          .lean()
          .exec(),
        Transaction.countDocuments({
          userId: typedUser._id,
          status: "failed",
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        }),
        listRecentJobRuns({
          jobNames: ["scraper-automation", "notifications-runner", "invoice-reminders"],
          limit: 6,
        }),
      ])

    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const next7Days = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000)
    const next30Days = new Date(todayStart.getTime() + 30 * 24 * 60 * 60 * 1000)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const cases = (caseRows as any[]).map((caseRecord) => ({
      ...caseRecord,
      _recordDate: getBestRecordDate(caseRecord),
    }))
    const clients = (clientRows as any[]).map((clientRecord) => ({
      ...clientRecord,
      _recordDate: getBestRecordDate(clientRecord),
    }))

    const pendingTaskRows = taskRows as any[]

    const overdueTasks = pendingTaskRows.filter((task) => {
      const due = parseCourtDate(task.dueDate)
      return Boolean(due && due < todayStart)
    }).length

    const tasksDueNext7Days = pendingTaskRows.filter((task) => {
      const due = parseCourtDate(task.dueDate)
      return Boolean(due && due >= todayStart && due <= next7Days)
    }).length

    const recentTasks = pendingTaskRows
      .sort((left, right) => {
        const leftDate = parseCourtDate(left.dueDate)?.getTime() || Number.MAX_SAFE_INTEGER
        const rightDate = parseCourtDate(right.dueDate)?.getTime() || Number.MAX_SAFE_INTEGER
        return leftDate - rightDate
      })
      .slice(0, 6)

    const upcomingHearings = cases
      .filter((caseRecord: any) => {
        if (!caseRecord.courtDate) return false
        const parsedDate = parseCourtDate(caseRecord.courtDate)
        return parsedDate !== null && parsedDate >= todayStart
      })
      .sort((left: any, right: any) => {
        const leftDate = parseCourtDate(left.courtDate)?.getTime() || Number.MAX_SAFE_INTEGER
        const rightDate = parseCourtDate(right.courtDate)?.getTime() || Number.MAX_SAFE_INTEGER
        return leftDate - rightDate
      })
      .slice(0, 10)
      .map((caseRecord: any) => {
        const parsedDate = parseCourtDate(caseRecord.courtDate)
        return {
          ...caseRecord,
          courtDate: parsedDate ? toClientDateTimeIso(parsedDate) : caseRecord.courtDate,
        }
      })

    const hearingsNext30Days = upcomingHearings.filter((caseRecord: any) => {
      const parsedDate = parseCourtDate(caseRecord.courtDate)
      return Boolean(parsedDate && parsedDate <= next30Days)
    }).length

    const sortedCases = [...cases].sort(
      (left: any, right: any) => right._recordDate.getTime() - left._recordDate.getTime(),
    )
    const sortedClients = [...clients].sort(
      (left: any, right: any) => right._recordDate.getTime() - left._recordDate.getTime(),
    )

    const recentCases = sortedCases.slice(0, 5)
    const recentClients = sortedClients.slice(0, 5)

    let totalOutstanding = 0
    let overdueOutstanding = 0
    let overdueInvoices = 0
    let openBillingIssues = 0
    let collectedThisMonth = 0

    for (const invoice of invoices as any[]) {
      const total = Number(invoice.total || 0)
      const paidAmount = Number(invoice.paidAmount || 0)
      const outstanding = Math.max(Number((total - paidAmount).toFixed(2)), 0)
      const dueDate = new Date(invoice.dueDate)
      const isOverdue =
        invoice.status === "overdue" ||
        (invoice.status !== "paid" && outstanding > 0 && dueDate.getTime() < now.getTime())

      totalOutstanding += outstanding
      if (isOverdue) {
        overdueOutstanding += outstanding
        overdueInvoices += 1
      }

      if (invoice.supportIssueStatus === "open" || invoice.supportIssueStatus === "in_progress") {
        openBillingIssues += 1
      }

      const updatedAt = new Date(invoice.updatedAt || invoice.createdAt)
      if (updatedAt >= monthStart) {
        collectedThisMonth += Math.max(paidAmount, 0)
      }
    }

    const recentInvoices = (invoices as any[]).slice(0, 5)

    const activityFeed = [
      ...recentCases.map((caseRecord: any) =>
        buildActivityItem({
          type: "case",
          title: caseRecord.caseTitle || caseRecord.caseNo || "Case updated",
          subtitle: `Case: ${caseRecord.caseNo || "N/A"}`,
          at: caseRecord._recordDate,
          href: `/case-tracking/view/${caseRecord._id}`,
          status: "info",
        }),
      ),
      ...recentClients.map((clientRecord: any) =>
        buildActivityItem({
          type: "client",
          title: clientRecord.name || "Client added",
          subtitle: clientRecord.email || clientRecord.contact || "Client profile updated",
          at: clientRecord._recordDate,
          href: `/my-clients/view/${clientRecord._id}`,
          status: "success",
        }),
      ),
      ...recentTasks.map((task: any) => {
        const dueDate = parseCourtDate(task.dueDate)
        const taskDate = task.updatedAt ? new Date(task.updatedAt) : new Date()
        const isOverdue = Boolean(dueDate && dueDate < todayStart)

        return buildActivityItem({
          type: "task",
          title: task.task || "Task",
          subtitle: dueDate ? `Due ${dueDate.toLocaleDateString("en-IN")}` : "Task scheduled",
          at: taskDate,
          href: "/tasks",
          status: isOverdue ? "warning" : "info",
        })
      }),
      ...recentInvoices.map((invoice: any) =>
        buildActivityItem({
          type: "invoice",
          title: `Invoice ${invoice.invoiceNumber}`,
          subtitle: `${invoice.clientName || "Client"} • ${invoice.status}`,
          at: new Date(invoice.updatedAt || invoice.createdAt),
          href: "/invoices",
          status: invoice.status === "paid" ? "success" : invoice.status === "overdue" ? "warning" : "info",
        }),
      ),
      ...(recentTransactions as any[]).map((transaction) =>
        buildActivityItem({
          type: "transaction",
          title: transaction.description || "Billing transaction",
          subtitle: `${transaction.currency || "INR"} ${Number(transaction.amount || 0).toFixed(2)} • ${transaction.status}`,
          at: new Date(transaction.createdAt),
          href: "/settings?tab=billing",
          status: transaction.status === "failed" ? "error" : transaction.status === "completed" ? "success" : "info",
        }),
      ),
    ]
      .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
      .slice(0, 12)

    return NextResponse.json({
      stats: {
        totalCases: cases.length,
        totalClients: clients.length,
        pendingTasks: pendingTaskRows.length,
        completedTasks: Number(completedTaskCount || 0),
        upcomingHearings: upcomingHearings.length,
      },
      recentCases,
      recentClients,
      recentTasks,
      upcomingHearings,
      subscription,
      analytics: {
        overdueTasks,
        tasksDueNext7Days,
        hearingsNext30Days,
        outstandingInvoices: clampAmount(totalOutstanding),
        overdueInvoices,
        recentFailedTransactions,
      },
      billing: {
        totalOutstanding: clampAmount(totalOutstanding),
        overdueOutstanding: clampAmount(overdueOutstanding),
        collectedThisMonth: clampAmount(collectedThisMonth),
        openBillingIssues,
        recentTransactions,
      },
      activityFeed,
      operations: {
        automationEnabled: Boolean(subscription?.features?.advancedAutomation),
        recentJobs: recentJobRuns,
      },
    })
  } catch (error) {
    console.error("Dashboard API error:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}
