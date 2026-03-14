import { NextRequest, NextResponse } from "next/server"
import User from "../../lib/models/user"
import Case from "../../lib/models/case"
import Client from "../../lib/models/client"
import Task from "../../lib/models/task"
import connectMongoWithRetry from "../../lib/db/connectMongo"
import { auth } from "@clerk/nextjs/server"
import { ensureUser } from "../../lib/ensureUser"

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Ensure user exists in MongoDB (auto-creates if webhook missed)
    await ensureUser(userId)

    await connectMongoWithRetry()
    const user = await User.findOne({ clerkUid: userId })
      .populate("cases")
      .populate("clients")
      .lean()
      .exec()

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

    // Parse courtDate which may be DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY, or ISO
    function parseCourtDate(dateStr: string): Date | null {
      if (!dateStr) return null
      // Try DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
      const parts = dateStr.split(/[.\/-]/)
      if (parts.length === 3) {
        const [a, b, c] = parts
        // If first part is 4 digits, it's YYYY-MM-DD
        if (a.length === 4) {
          const d = new Date(`${a}-${b.padStart(2,'0')}-${c.padStart(2,'0')}T00:00:00`)
          return isNaN(d.getTime()) ? null : d
        }
        // Otherwise assume DD.MM.YYYY
        const d = new Date(`${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}T00:00:00`)
        return isNaN(d.getTime()) ? null : d
      }
      // Fallback: try native parsing
      const d = new Date(dateStr)
      return isNaN(d.getTime()) ? null : d
    }

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
        return { ...c, courtDate: parsed ? parsed.toISOString() : c.courtDate }
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
    })
  } catch (error) {
    console.error("Dashboard API error:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}
