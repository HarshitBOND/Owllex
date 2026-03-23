import { beforeEach, describe, expect, it, vi } from "vitest"

const mockState = vi.hoisted(() => ({
  createComplaint: vi.fn(),
  connectMongo: vi.fn(),
  auth: vi.fn(),
  sendMail: vi.fn(),
  setApiKey: vi.fn(),
}))

vi.mock("@/app/api/lib/db/connectMongo", () => ({
  default: mockState.connectMongo,
}))

vi.mock("@/app/api/lib/models/complaint", () => ({
  default: {
    create: mockState.createComplaint,
  },
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockState.auth,
}))

vi.mock("@sendgrid/mail", () => ({
  default: {
    send: mockState.sendMail,
    setApiKey: mockState.setApiKey,
  },
}))

import { POST } from "@/app/api/complaints/route"

describe("complaints route", () => {
  beforeEach(() => {
    mockState.createComplaint.mockReset()
    mockState.connectMongo.mockReset()
    mockState.auth.mockReset()
    mockState.sendMail.mockReset()
    mockState.setApiKey.mockReset()

    mockState.auth.mockResolvedValue({ userId: "user_123" })
    mockState.createComplaint.mockResolvedValue({
      _id: {
        toString: () => "complaint_1",
      },
    })

    vi.stubEnv("SUPPORT_TEAM_EMAIL", "support@example.com")
    vi.stubEnv("SENDGRID_API_KEY", "sg_test")
    vi.stubEnv("NOTIFICATION_FROM_EMAIL", "noreply@example.com")
  })

  it("rejects invalid payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/complaints", {
        method: "POST",
        body: JSON.stringify({ name: "A", email: "bad" }),
      }) as any,
    )

    expect(response.status).toBe(400)
    expect(mockState.createComplaint).not.toHaveBeenCalled()
  })

  it("creates complaint for valid payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/complaints", {
        method: "POST",
        body: JSON.stringify({
          name: "Harsh",
          email: "harsh@example.com",
          subject: "Need support",
          message: "I need help with invoice reconciliation and notifications.",
        }),
      }) as any,
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockState.connectMongo).toHaveBeenCalled()
    expect(mockState.createComplaint).toHaveBeenCalledTimes(1)
  })
})
