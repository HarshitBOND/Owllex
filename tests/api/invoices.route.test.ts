import { beforeEach, describe, expect, it, vi } from "vitest"

const mockState = vi.hoisted(() => ({
  requireUserContext: vi.fn(),
  connectMongo: vi.fn(),
  ensureUser: vi.fn(),
}))

vi.mock("@/app/api/lib/routeGuards", () => ({
  requireUserContext: mockState.requireUserContext,
}))

vi.mock("@/app/api/lib/db/connectMongo", () => ({
  default: mockState.connectMongo,
}))

vi.mock("@/app/api/lib/ensureUser", () => ({
  ensureUser: mockState.ensureUser,
}))

vi.mock("@/app/api/lib/models/simple-invoice", () => ({
  default: {
    findOne: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
    findOneAndDelete: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateMany: vi.fn(() => ({ exec: vi.fn() })),
  },
}))

vi.mock("@/app/api/lib/models/user", () => ({
  default: {
    findOne: vi.fn(),
  },
}))

vi.mock("@/app/api/lib/models/transaction", () => ({
  default: {
    create: vi.fn(),
  },
}))

vi.mock("@/app/api/lib/services/razorpay", () => ({
  getRazorpayClient: vi.fn(),
  getRazorpayCheckoutBaseUrl: vi.fn(() => "http://localhost:3000"),
}))

vi.mock("@/app/api/lib/services/rbac", () => ({
  canAccessFirm: vi.fn(async () => ({ allowed: false })),
}))

vi.mock("@sendgrid/mail", () => ({
  default: {
    send: vi.fn(),
    setApiKey: vi.fn(),
  },
}))

import { DELETE, PATCH, POST } from "@/app/api/userdetails/invoices/route"

const withNextUrl = (request: Request) => {
  ;(request as any).nextUrl = new URL(request.url)
  return request as any
}

describe("userdetails invoices route", () => {
  beforeEach(() => {
    mockState.requireUserContext.mockReset()
    mockState.connectMongo.mockReset()
    mockState.ensureUser.mockReset()

    mockState.requireUserContext.mockResolvedValue({ clerkUid: "user_123" })
  })

  it("rejects invalid invoice create payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/userdetails/invoices", {
        method: "POST",
        body: JSON.stringify({ clientName: "A" }),
      }) as any,
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBeTruthy()
  })

  it("requires invoice id for payment patch", async () => {
    const response = await PATCH(
      withNextUrl(
        new Request("http://localhost/api/userdetails/invoices", {
          method: "PATCH",
          body: JSON.stringify({ amount: 100, method: "upi" }),
        }),
      ),
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe("Invoice ID required")
  })

  it("rejects invalid payment payload", async () => {
    const response = await PATCH(
      withNextUrl(
        new Request("http://localhost/api/userdetails/invoices?id=inv_001", {
          method: "PATCH",
          body: JSON.stringify({ amount: -50, method: "upi" }),
        }),
      ),
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBeTruthy()
  })

  it("requires invoice id for delete", async () => {
    const response = await DELETE(
      withNextUrl(new Request("http://localhost/api/userdetails/invoices", { method: "DELETE" })),
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe("Invoice ID required")
  })
})
