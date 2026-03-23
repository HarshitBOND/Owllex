import { beforeEach, describe, expect, it, vi } from "vitest"

const mockState = vi.hoisted(() => ({
  requireUserContext: vi.fn(),
  requireOwnedCase: vi.fn(),
  connectMongo: vi.fn(),
}))

vi.mock("@/app/api/lib/routeGuards", () => ({
  requireUserContext: mockState.requireUserContext,
  requireOwnedCase: mockState.requireOwnedCase,
}))

vi.mock("@/app/api/lib/db/connectMongo", () => ({
  default: mockState.connectMongo,
}))

vi.mock("@/app/api/lib/services/calendar", () => ({
  syncCalendarEventsForUser: vi.fn(),
}))

vi.mock("@/app/api/lib/models/task", () => ({
  default: {
    find: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOne: vi.fn(),
  },
}))

vi.mock("@/app/api/lib/models/case", () => ({
  default: {
    findById: vi.fn(),
  },
}))

vi.mock("@/app/api/lib/models/user", () => ({
  default: {
    findOne: vi.fn(),
  },
}))

import { GET, POST } from "@/app/api/userdetails/tasks/route"

const withNextUrl = (request: Request) => {
  ;(request as any).nextUrl = new URL(request.url)
  return request as any
}

describe("userdetails tasks route", () => {
  beforeEach(() => {
    mockState.requireUserContext.mockReset()
    mockState.requireOwnedCase.mockReset()
    mockState.connectMongo.mockReset()

    mockState.requireUserContext.mockResolvedValue({ clerkUid: "user_123" })
  })

  it("rejects invalid task status filter", async () => {
    const response = await GET(
      withNextUrl(new Request("http://localhost/api/userdetails/tasks?status=archived")),
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.message).toBe("Invalid task status")
  })

  it("rejects invalid task create payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/userdetails/tasks", {
        method: "POST",
        body: JSON.stringify({ task: "A" }),
      }) as any,
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.message).toBeTruthy()
    expect(mockState.connectMongo).toHaveBeenCalledTimes(1)
  })
})
