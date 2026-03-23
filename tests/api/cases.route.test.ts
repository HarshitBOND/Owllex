import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const mockState = vi.hoisted(() => ({
  requireUserContext: vi.fn(),
  connectMongo: vi.fn(),
}))

vi.mock("@/app/api/lib/routeGuards", () => ({
  requireUserContext: mockState.requireUserContext,
  requireOwnedCase: vi.fn(),
  requireOwnedClient: vi.fn(),
}))

vi.mock("@/app/api/lib/db/connectMongo", () => ({
  default: mockState.connectMongo,
}))

vi.mock("@/app/api/lib/ensureUser", () => ({
  ensureUser: vi.fn(),
}))

vi.mock("@/app/api/lib/services/calendar", () => ({
  syncCalendarEventsForUser: vi.fn(),
}))

vi.mock("@/app/api/lib/services/caseHearing", () => ({
  appendCourtDateChange: vi.fn(),
}))

vi.mock("@/app/api/lib/services/notifications", () => ({
  reconcileNotificationsForCase: vi.fn(),
}))

vi.mock("@/app/api/lib/services/subscription", () => ({
  checkCaseCreationAllowance: vi.fn(),
}))

vi.mock("@/app/api/lib/models/causelist-cases", () => ({
  default: {
    findById: vi.fn(),
  },
}))

vi.mock("@/app/api/lib/models/case", () => ({
  default: {
    findById: vi.fn(),
    findByIdAndDelete: vi.fn(),
    create: vi.fn(),
    find: vi.fn(),
  },
}))

vi.mock("@/app/api/lib/models/user", () => ({
  default: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}))

vi.mock("@/app/api/lib/models/scraped-case", () => ({
  default: {
    findById: vi.fn(),
    findOne: vi.fn(),
  },
}))

vi.mock("@/app/api/lib/models/client", () => ({
  default: {
    findById: vi.fn(),
    updateMany: vi.fn(),
  },
}))

vi.mock("@/app/api/lib/services/rbac", () => ({
  canAccessFirm: vi.fn(async () => ({ allowed: false })),
}))

import { GET, POST } from "@/app/api/userdetails/cases/route"

const withNextUrl = (request: Request) => {
  ;(request as any).nextUrl = new URL(request.url)
  return request as any
}

describe("userdetails cases route", () => {
  beforeEach(() => {
    mockState.requireUserContext.mockReset()
    mockState.connectMongo.mockReset()
  })

  it("returns auth response when unauthenticated", async () => {
    mockState.requireUserContext.mockResolvedValue(
      NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
    )

    const response = await GET(withNextUrl(new Request("http://localhost/api/userdetails/cases")))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("Unauthorized")
    expect(mockState.connectMongo).not.toHaveBeenCalled()
  })

  it("rejects invalid case create payload", async () => {
    mockState.requireUserContext.mockResolvedValue({ clerkUid: "user_123" })

    const response = await POST(
      new Request("http://localhost/api/userdetails/cases", {
        method: "POST",
        body: JSON.stringify({ fileNumber: "FN-001" }),
      }) as any,
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toBeTruthy()
    expect(mockState.connectMongo).toHaveBeenCalledTimes(1)
  })
})
