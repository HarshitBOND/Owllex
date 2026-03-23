import { beforeEach, describe, expect, it, vi } from "vitest"

const mockState = vi.hoisted(() => ({
  connectMongo: vi.fn(),
  ensureUser: vi.fn(),
  requireUserContext: vi.fn(),
  requireOwnedClient: vi.fn(),
  findUserOne: vi.fn(),
  findUserOneAndUpdate: vi.fn(),
  clientSave: vi.fn(),
}))

vi.mock("@/app/api/lib/db/connectMongo", () => ({
  default: mockState.connectMongo,
}))

vi.mock("@/app/api/lib/ensureUser", () => ({
  ensureUser: mockState.ensureUser,
}))

vi.mock("@/app/api/lib/routeGuards", () => ({
  requireUserContext: mockState.requireUserContext,
  requireOwnedClient: mockState.requireOwnedClient,
}))

vi.mock("@/app/api/lib/models/client", () => ({
  default: class MockClient {
    _id: string
    payload: Record<string, unknown>

    constructor(payload: Record<string, unknown>) {
      this._id = "client_001"
      this.payload = payload
    }

    async save() {
      return mockState.clientSave(this.payload)
    }

    static findById = vi.fn()
    static findByIdAndUpdate = vi.fn()
    static findByIdAndDelete = vi.fn()
    static create = vi.fn()
    static updateMany = vi.fn()
  },
}))

vi.mock("@/app/api/lib/models/case", () => ({
  default: {
    findByIdAndUpdate: vi.fn(),
  },
}))

vi.mock("@/app/api/lib/models/user", () => ({
  default: {
    findOne: mockState.findUserOne,
    findOneAndUpdate: mockState.findUserOneAndUpdate,
  },
}))

vi.mock("@/app/api/lib/services/rbac", () => ({
  canAccessFirm: vi.fn(async () => ({ allowed: false })),
}))

import { POST } from "@/app/api/userdetails/clients/route"

const buildPostRequest = (payload: Record<string, unknown>) =>
  new Request("http://localhost/api/userdetails/clients", {
    method: "POST",
    body: JSON.stringify(payload),
  }) as any

describe("userdetails clients route", () => {
  beforeEach(() => {
    mockState.connectMongo.mockReset()
    mockState.ensureUser.mockReset()
    mockState.requireUserContext.mockReset()
    mockState.requireOwnedClient.mockReset()
    mockState.findUserOne.mockReset()
    mockState.findUserOneAndUpdate.mockReset()
    mockState.clientSave.mockReset()

    mockState.requireUserContext.mockResolvedValue({ clerkUid: "user_123" })
    mockState.findUserOne.mockReturnValue({
      select: () => ({
        lean: () => ({
          exec: async () => ({ primaryFirmId: "firm_123" }),
        }),
      }),
    })
    mockState.findUserOneAndUpdate.mockResolvedValue({ _id: "user_doc_1" })
    mockState.clientSave.mockResolvedValue({ _id: "client_001" })
  })

  it("rejects invalid client payload", async () => {
    const response = await POST(
      buildPostRequest({
        name: "A",
        email: "bad-email",
      }),
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBeTruthy()
    expect(mockState.clientSave).not.toHaveBeenCalled()
  })

  it("creates a client for valid payload", async () => {
    const response = await POST(
      buildPostRequest({
        salutation: "mr",
        name: "Rahul Sharma",
        company: "LexVert LLP",
        email: "rahul@example.com",
        contact: "9999999999",
        alternateContact: "",
        gstin: "",
        group: "priority",
        address: {
          city: "Delhi",
        },
        customFields: [{ name: "segment", value: "gold" }],
      }),
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.clientId).toBe("client_001")
    expect(mockState.connectMongo).toHaveBeenCalledTimes(1)
    expect(mockState.ensureUser).toHaveBeenCalledWith("user_123")
    expect(mockState.clientSave).toHaveBeenCalledTimes(1)
    expect(mockState.findUserOneAndUpdate).toHaveBeenCalledTimes(1)
  })
})