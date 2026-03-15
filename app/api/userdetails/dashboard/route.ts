import { NextRequest, NextResponse } from "next/server"
import User from "../../lib/models/user"
import Case from "../../lib/models/case"
import Client from "../../lib/models/client"
import Task from "../../lib/models/task"
import connectMongoWithRetry from "../../lib/db/connectMongo"
import { auth } from "@clerk/nextjs/server"
import { ensureUser } from "../../lib/ensureUser"
import { parseCourtDate, toClientDateTimeIso } from "@/lib/hearingDates"
import { ensureUserSubscriptionDefaults, getUserSubscriptionSummary } from "../../lib/services/subscription"

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Ensure user exists in MongoDB (auto-creates if webhook missed)
    await ensureUser(userId)
    await ensureUserSubscriptionDefaults(userId)

    await connectMongoWithRetry()
    const user = await User.findOne({ clerkUid: userId })
      .populate("cases")
      .populate("clients")
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
      })
    }

    const cases = (user as any).cases || []
    const clients = (user as any).clients || []

    // Get task counts
    const [pendingTasks, completedTasks] = await Promise.all([
      Task.countDocuments({ clerkUid: userId, status: "pending" }),
      Task.countDocuments({ clerkUid: userId, status: "completed" }),
    ])

    // Get recent pending tasks
    const recentTasks = await Task.find({ clerkUid: userId, status: "pending" })
      .sort({ dueDate: 1 })
      .limit(5)
      .lean()
      .exec()

    // Calculate upcoming hearings from cases with courtDate
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const upcomingHearings = cases
      .filter((c: any) => {
        if (!c.courtDate) return false
        const d = parseCourtDate(c.courtDate)
        return d !== null && d >= now
      })
      .sort((a: any, b: any) => {
        const da = parseCourtDate(a.courtDate)!
        const db = parseCourtDate(b.courtDate)!
        return da.getTime() - db.getTime()
      })
      .slice(0, 10)
      .map((c: any) => {
        // Normalize courtDate to ISO string so frontend can parse it
        const parsed = parseCourtDate(c.courtDate)
        return { ...c, courtDate: parsed ? toClientDateTimeIso(parsed) : c.courtDate }
      })

    // Recent cases (last 5)
    const recentCases = cases.slice(-5).reverse()

    // Recent clients (last 5)
    const recentClients = clients.slice(-5).reverse()

    return NextResponse.json({
      stats: {
        totalCases: cases.length,
        totalClients: clients.length,
        pendingTasks,
        completedTasks,
        upcomingHearings: upcomingHearings.length,
      },
      recentCases,
      recentClients,
      recentTasks,
      upcomingHearings,
      subscription,
    })
  } catch (error) {
    console.error("Dashboard API error:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}
