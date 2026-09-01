import { NextRequest, NextResponse } from "next/server"
import { requireUserContext } from "@/app/api/lib/routeGuards"
import { getAiUsage } from "@/app/api/lib/services/aiUsage"
import { PLAN_MODELS } from "@/lib/ai/models"

export async function GET(request: NextRequest) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const snapshot = await getAiUsage(userContext.clerkUid)
  if (!snapshot) {
    return NextResponse.json({ success: false, error: "Subscription not found" }, { status: 404 })
  }

  const window = (used: number, cap: number, resetAt: Date | null) => ({
    usedPaise: used,
    capPaise: cap,
    percent: cap > 0 ? Math.min(Math.round((used / cap) * 100), 100) : 100,
    resetAt: resetAt ? resetAt.toISOString() : null,
  })

  return NextResponse.json({
    success: true,
    plan: snapshot.plan,
    isActive: snapshot.isActive,
    allowedModels: PLAN_MODELS[snapshot.plan] ?? PLAN_MODELS.free,
    windows: {
      window5h: window(snapshot.window5h.usedPaise, snapshot.caps.window5hPaise, snapshot.window5h.resetAt),
      daily: window(snapshot.daily.usedPaise, snapshot.caps.dailyPaise, snapshot.daily.resetAt),
      weekly: window(snapshot.weekly.usedPaise, snapshot.caps.weeklyPaise, snapshot.weekly.resetAt),
      monthly: window(snapshot.monthly.usedPaise, snapshot.caps.monthlyPaise, snapshot.monthly.resetAt),
    },
    deepResearch: {
      used: snapshot.researchRunsUsed,
      limit: snapshot.caps.deepResearchRunsPerMonth,
    },
  })
}
