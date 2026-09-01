import { NextResponse } from "next/server"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import User from "@/app/api/lib/models/user"
import AiUsageEvent from "@/app/api/lib/models/ai-usage-event"
import { getRedisClient } from "@/app/api/lib/rateLimit"
import { getUserSubscriptionSummary, type AiCaps, type SubscriptionPlan } from "./subscription"
import { costPaise } from "@/lib/ai/rates"
import type { ModelKey } from "@/lib/ai/models"

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const WINDOW_5H_SECONDS = 5 * 60 * 60

const istDate = () => new Date(Date.now() + IST_OFFSET_MS)

const periodKeyIST = () => {
  const d = istDate()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

const dayKeyIST = () => {
  const d = istDate()
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`
}

// Monday of the current IST week, as YYYYMMDD
const weekKeyIST = () => {
  const d = istDate()
  const daysSinceMonday = (d.getUTCDay() + 6) % 7
  const monday = new Date(d.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000)
  return `${monday.getUTCFullYear()}${String(monday.getUTCMonth() + 1).padStart(2, "0")}${String(monday.getUTCDate()).padStart(2, "0")}`
}

const secondsToMidnightIST = () => {
  const d = istDate()
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
  return Math.max(Math.ceil((midnight - d.getTime()) / 1000), 60)
}

const secondsToMondayIST = () => {
  const d = istDate()
  const daysSinceMonday = (d.getUTCDay() + 6) % 7
  const nextMonday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (7 - daysSinceMonday))
  return Math.max(Math.ceil((nextMonday - d.getTime()) / 1000), 60)
}

const nextMonthStartIST = () => {
  const d = istDate()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - IST_OFFSET_MS)
}

type MemoryCounter = { value: number; resetAt: number }
type GlobalUsageState = typeof globalThis & { __ravenslawAiUsageStore?: Map<string, MemoryCounter> }
const globalState = globalThis as GlobalUsageState
const memoryStore = globalState.__ravenslawAiUsageStore || new Map<string, MemoryCounter>()
globalState.__ravenslawAiUsageStore = memoryStore

// Returns { value, ttlSeconds } for a window counter (ttl -1 means no counter yet)
async function readCounter(key: string): Promise<{ value: number; ttlSeconds: number }> {
  const redis = getRedisClient()
  if (redis) {
    try {
      const [value, ttl] = await Promise.all([redis.get<number>(key), redis.ttl(key)])
      return { value: Number(value) || 0, ttlSeconds: Number(ttl) > 0 ? Number(ttl) : -1 }
    } catch {}
  }
  const entry = memoryStore.get(key)
  if (!entry || Date.now() > entry.resetAt) return { value: 0, ttlSeconds: -1 }
  return { value: entry.value, ttlSeconds: Math.ceil((entry.resetAt - Date.now()) / 1000) }
}

async function bumpCounter(key: string, amount: number, ttlSeconds: number) {
  const redis = getRedisClient()
  if (redis) {
    try {
      const value = Number(await redis.incrby(key, amount))
      if (value === amount) await redis.expire(key, ttlSeconds)
      return
    } catch {}
  }
  const entry = memoryStore.get(key)
  if (!entry || Date.now() > entry.resetAt) {
    memoryStore.set(key, { value: amount, resetAt: Date.now() + ttlSeconds * 1000 })
  } else {
    entry.value += amount
  }
}

export type AiUsageSnapshot = {
  plan: SubscriptionPlan
  isActive: boolean
  caps: AiCaps
  window5h: { usedPaise: number; resetAt: Date | null }
  daily: { usedPaise: number; resetAt: Date }
  weekly: { usedPaise: number; resetAt: Date }
  monthly: { usedPaise: number; resetAt: Date }
  researchRunsUsed: number
  corpusDocsUsed: number
}

export async function getAiUsage(clerkUid: string): Promise<AiUsageSnapshot | null> {
  await connectMongoWithRetry()
  const summary = await getUserSubscriptionSummary(clerkUid)
  if (!summary) return null

  const pk = periodKeyIST()
  const user = await User.findOne({ clerkUid }).select("subscription.aiUsage").lean<any>()
  const aiUsage = user?.subscription?.aiUsage
  let monthlyUsed = 0
  let researchRunsUsed = 0
  let corpusDocsUsed = 0
  if (aiUsage?.periodKey === pk) {
    monthlyUsed = aiUsage.costPaise || 0
    researchRunsUsed = aiUsage.researchRuns || 0
    corpusDocsUsed = aiUsage.corpusDocs || 0
  } else if (aiUsage?.periodKey) {
    await User.updateOne(
      { clerkUid },
      { $set: { "subscription.aiUsage": { periodKey: pk, costPaise: 0, researchRuns: 0, corpusDocs: 0 } } }
    ).exec()
  }

  const [w5, day, week] = await Promise.all([
    readCounter(`aiu:${clerkUid}:5h`),
    readCounter(`aiu:${clerkUid}:d:${dayKeyIST()}`),
    readCounter(`aiu:${clerkUid}:w:${weekKeyIST()}`),
  ])

  return {
    plan: summary.plan,
    isActive: summary.isActive,
    caps: summary.aiCaps,
    window5h: {
      usedPaise: w5.value,
      resetAt: w5.ttlSeconds > 0 ? new Date(Date.now() + w5.ttlSeconds * 1000) : null,
    },
    daily: { usedPaise: day.value, resetAt: new Date(Date.now() + secondsToMidnightIST() * 1000) },
    weekly: { usedPaise: week.value, resetAt: new Date(Date.now() + secondsToMondayIST() * 1000) },
    monthly: { usedPaise: monthlyUsed, resetAt: nextMonthStartIST() },
    researchRunsUsed,
    corpusDocsUsed,
  }
}

export type AiAllowance =
  | { allowed: true; snapshot: AiUsageSnapshot }
  | { allowed: false; reason: string; message: string; resetAt: Date | null }

export async function checkAiAllowance(clerkUid: string): Promise<AiAllowance> {
  const snapshot = await getAiUsage(clerkUid)
  if (!snapshot) {
    return { allowed: false, reason: "no_subscription", message: "Subscription not found", resetAt: null }
  }
  if (!snapshot.isActive) {
    return {
      allowed: false,
      reason: "inactive",
      message: "Your subscription is not active. Renew to keep using the AI assistant.",
      resetAt: null,
    }
  }
  const { caps } = snapshot
  if (snapshot.window5h.usedPaise >= caps.window5hPaise) {
    return {
      allowed: false,
      reason: "window_5h",
      message: "You've reached your 5-hour AI usage limit.",
      resetAt: snapshot.window5h.resetAt,
    }
  }
  if (snapshot.daily.usedPaise >= caps.dailyPaise) {
    return {
      allowed: false,
      reason: "daily",
      message: "You've reached your daily AI usage limit.",
      resetAt: snapshot.daily.resetAt,
    }
  }
  if (snapshot.weekly.usedPaise >= caps.weeklyPaise) {
    return {
      allowed: false,
      reason: "weekly",
      message: "You've reached your weekly AI usage limit.",
      resetAt: snapshot.weekly.resetAt,
    }
  }
  if (snapshot.monthly.usedPaise >= caps.monthlyPaise) {
    return {
      allowed: false,
      reason: "monthly",
      message: "You've reached your monthly AI usage limit. Upgrade your plan for more.",
      resetAt: snapshot.monthly.resetAt,
    }
  }
  return { allowed: true, snapshot }
}

export function aiLimitResponse(check: Extract<AiAllowance, { allowed: false }>) {
  return NextResponse.json(
    {
      success: false,
      error: check.message,
      details: { limitReason: check.reason, resetAt: check.resetAt ? check.resetAt.toISOString() : null },
    },
    { status: check.reason === "inactive" || check.reason === "no_subscription" ? 403 : 429 }
  )
}

export async function recordAiUsage(input: {
  clerkUid: string
  feature: string
  modelKey: ModelKey
  usage: {
    inputTokens?: number
    outputTokens?: number
    cachedInputTokens?: number
    promptTokens?: number
    completionTokens?: number
  } | null | undefined
}) {
  const usage = input.usage || {}
  const inputTokens = usage.inputTokens ?? usage.promptTokens ?? 0
  const outputTokens = usage.outputTokens ?? usage.completionTokens ?? 0
  const cachedInputTokens = usage.cachedInputTokens ?? 0
  const paise = costPaise(input.modelKey, { inputTokens, outputTokens, cachedInputTokens })

  try {
    await Promise.all([
      bumpCounter(`aiu:${input.clerkUid}:5h`, paise, WINDOW_5H_SECONDS),
      bumpCounter(`aiu:${input.clerkUid}:d:${dayKeyIST()}`, paise, secondsToMidnightIST()),
      bumpCounter(`aiu:${input.clerkUid}:w:${weekKeyIST()}`, paise, secondsToMondayIST()),
    ])
    await connectMongoWithRetry()
    const pk = periodKeyIST()
    const matched = await User.updateOne(
      { clerkUid: input.clerkUid, "subscription.aiUsage.periodKey": pk },
      { $inc: { "subscription.aiUsage.costPaise": paise } }
    ).exec()
    if (!matched.matchedCount) {
      await User.updateOne(
        { clerkUid: input.clerkUid },
        { $set: { "subscription.aiUsage": { periodKey: pk, costPaise: paise, researchRuns: 0, corpusDocs: 0 } } }
      ).exec()
    }
    await AiUsageEvent.create({
      clerkUid: input.clerkUid,
      feature: input.feature,
      modelKey: input.modelKey,
      inputTokens,
      outputTokens,
      cachedInputTokens,
      costPaise: paise,
    })
  } catch (error) {
    console.error("[AI_USAGE] failed to record usage:", error)
  }
}

// Deep Research monthly run counter: counts the run up front (a started run is a spent run).
export async function checkAndCountResearchRun(clerkUid: string, snapshot: AiUsageSnapshot): Promise<AiAllowance> {
  const limit = snapshot.caps.deepResearchRunsPerMonth
  if (snapshot.researchRunsUsed >= limit) {
    return {
      allowed: false,
      reason: "research_runs",
      message:
        limit === 0
          ? "Deep Research is not available on your plan. Upgrade to use it."
          : `You've used all ${limit} Deep Research runs for this month.`,
      resetAt: snapshot.monthly.resetAt,
    }
  }
  await connectMongoWithRetry()
  const pk = periodKeyIST()
  const matched = await User.updateOne(
    { clerkUid, "subscription.aiUsage.periodKey": pk },
    { $inc: { "subscription.aiUsage.researchRuns": 1 } }
  ).exec()
  if (!matched.matchedCount) {
    await User.updateOne(
      { clerkUid },
      { $set: { "subscription.aiUsage": { periodKey: pk, costPaise: 0, researchRuns: 1, corpusDocs: 0 } } }
    ).exec()
  }
  return { allowed: true, snapshot }
}

export async function countCorpusDoc(clerkUid: string) {
  await connectMongoWithRetry()
  const pk = periodKeyIST()
  const matched = await User.updateOne(
    { clerkUid, "subscription.aiUsage.periodKey": pk },
    { $inc: { "subscription.aiUsage.corpusDocs": 1 } }
  ).exec()
  if (!matched.matchedCount) {
    await User.updateOne(
      { clerkUid },
      { $set: { "subscription.aiUsage": { periodKey: pk, costPaise: 0, researchRuns: 0, corpusDocs: 1 } } }
    ).exec()
  }
}
