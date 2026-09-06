import { beforeEach, describe, expect, it, vi } from "vitest"

const mockState = vi.hoisted(() => ({
  connectMongo: vi.fn(),
  userFindOne: vi.fn(),
  userUpdateOne: vi.fn(),
  usageEventCreate: vi.fn(),
  getUserSubscriptionSummary: vi.fn(),
}))

vi.mock("@/app/api/lib/db/connectMongo", () => ({
  default: mockState.connectMongo,
}))

vi.mock("@/app/api/lib/models/user", () => ({
  default: {
    findOne: mockState.userFindOne,
    updateOne: mockState.userUpdateOne,
  },
}))

vi.mock("@/app/api/lib/models/ai-usage-event", () => ({
  default: {
    create: mockState.usageEventCreate,
  },
}))

vi.mock("@/app/api/lib/services/subscription", async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    getUserSubscriptionSummary: mockState.getUserSubscriptionSummary,
  }
})

import { checkAiAllowance, recordAiUsage } from "@/app/api/lib/services/aiUsage"
import { resolveModel } from "@/lib/ai/models"
import { costPaise } from "@/lib/ai/rates"

const starterSummary = {
  plan: "starter",
  isActive: true,
  aiCaps: {
    window5hPaise: 6000,
    dailyPaise: 12000,
    weeklyPaise: 42000,
    monthlyPaise: 120000,
    deepResearchRunsPerMonth: 5,
    corpusDocsPerMonth: 50,
  },
}

const leanUser = (aiUsage: any) => ({
  select: () => ({ lean: () => Promise.resolve({ subscription: { aiUsage } }) }),
})

describe("costPaise", () => {
  it("charges input, output and cached input at their own rates", () => {
    // fast: 2100 in / 16800 out / 210 cached, per 1M tokens
    const paise = costPaise("fast", { inputTokens: 1_000_000, outputTokens: 1_000_000 })
    expect(paise).toBe(2100 + 16800)
  })

  it("bills cached tokens at the cached rate, not the input rate", () => {
    const paise = costPaise("fast", { inputTokens: 1_000_000, cachedInputTokens: 1_000_000, outputTokens: 0 })
    expect(paise).toBe(210)
  })

  it("never returns zero for a real call", () => {
    expect(costPaise("fast", { inputTokens: 10, outputTokens: 5 })).toBeGreaterThanOrEqual(1)
  })
})

describe("resolveModel", () => {
  it("clamps trial users to fast even when they ask for capable", () => {
    expect(resolveModel("trial", "capable", "balanced")).toBe("fast")
  })

  it("lets starter use balanced but not capable", () => {
    expect(resolveModel("starter", "balanced", "fast")).toBe("balanced")
    expect(resolveModel("starter", "capable", "fast")).toBe("fast")
  })

  it("lets professional pick capable", () => {
    expect(resolveModel("professional", "capable", "fast")).toBe("capable")
  })

  it("clamps unknown model strings and unknown plans down", () => {
    expect(resolveModel("starter", "gpt-9-ultra", "balanced")).toBe("balanced")
    expect(resolveModel("nonsense-plan", "capable", "capable")).toBe("fast")
  })
})

describe("checkAiAllowance", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockState.userUpdateOne.mockReturnValue({ exec: () => Promise.resolve({ matchedCount: 1 }) })
  })

  it("blocks when the subscription is not active", async () => {
    mockState.getUserSubscriptionSummary.mockResolvedValue({ ...starterSummary, isActive: false })
    mockState.userFindOne.mockReturnValue(leanUser(null))

    const check = await checkAiAllowance("user_inactive")
    expect(check.allowed).toBe(false)
    if (!check.allowed) expect(check.reason).toBe("inactive")
  })

  it("allows a fresh user and then blocks once recorded usage passes the 5h window cap", async () => {
    mockState.getUserSubscriptionSummary.mockResolvedValue(starterSummary)
    mockState.userFindOne.mockReturnValue(leanUser(null))

    const uid = `user_${Date.now()}`
    const first = await checkAiAllowance(uid)
    expect(first.allowed).toBe(true)

    // fast output at 16800 paise/M: 4M output tokens ≈ 67200 paise > every starter window
    await recordAiUsage({ clerkUid: uid, feature: "chat", modelKey: "fast", usage: { outputTokens: 4_000_000 } })

    const second = await checkAiAllowance(uid)
    expect(second.allowed).toBe(false)
    if (!second.allowed) {
      expect(second.reason).toBe("window_5h")
      expect(second.resetAt).toBeInstanceOf(Date)
    }
  })

  it("blocks on the monthly cap from the mongo counter", async () => {
    mockState.getUserSubscriptionSummary.mockResolvedValue(starterSummary)
    const periodKey = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 7)
    mockState.userFindOne.mockReturnValue(leanUser({ periodKey, costPaise: 120000, researchRuns: 0, corpusDocs: 0 }))

    const check = await checkAiAllowance(`user_monthly_${Date.now()}`)
    expect(check.allowed).toBe(false)
    if (!check.allowed) expect(check.reason).toBe("monthly")
  })
})
