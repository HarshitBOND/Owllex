import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const mockState = vi.hoisted(() => ({
  requireUserContext: vi.fn(),
  ensureUser: vi.fn(),
}))

vi.mock("@/app/api/lib/routeGuards", () => ({
  requireUserContext: mockState.requireUserContext,
}))

vi.mock("@/app/api/lib/ensureUser", () => ({
  ensureUser: mockState.ensureUser,
}))

import { POST } from "@/app/api/userdetails/sync/route"

describe("userdetails sync route", () => {
  beforeEach(() => {
    mockState.requireUserContext.mockReset()
    mockState.ensureUser.mockReset()
  })

  it("passes through unauthorized response", async () => {
    mockState.requireUserContext.mockResolvedValue(
      NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
    )

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("Unauthorized")
  })

  it("returns synced user payload", async () => {
    mockState.requireUserContext.mockResolvedValue({ clerkUid: "user_123" })
    mockState.ensureUser.mockResolvedValue({
      _id: "mongo_123",
      clerkUid: "user_123",
      firstName: "Harsh",
      lastName: "Sharma",
      email: "harsh@example.com",
    })

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.user.clerkUid).toBe("user_123")
    expect(body.user.email).toBe("harsh@example.com")
  })
})
