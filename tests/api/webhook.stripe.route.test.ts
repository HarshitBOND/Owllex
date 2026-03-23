import { beforeEach, describe, expect, it, vi } from "vitest"

const mockState = vi.hoisted(() => ({
  connectMongo: vi.fn(),
  getStripeClient: vi.fn(),
  getStripeWebhookSecret: vi.fn(),
  constructEvent: vi.fn(),
  paymentIntentsRetrieve: vi.fn(),
  invoicesRetrieve: vi.fn(),
  transactionFindById: vi.fn(),
  transactionFindOne: vi.fn(),
  transactionFindOneAndUpdate: vi.fn(),
  transactionCreate: vi.fn(),
  simpleInvoiceFindById: vi.fn(),
  userFindOne: vi.fn(),
  activateUserSubscriptionFromPayment: vi.fn(),
  markUserSubscriptionPastDue: vi.fn(),
}))

vi.mock("@/app/api/lib/db/connectMongo", () => ({
  default: mockState.connectMongo,
}))

vi.mock("@/app/api/lib/models/simple-invoice", () => ({
  default: {
    findById: mockState.simpleInvoiceFindById,
  },
}))

vi.mock("@/app/api/lib/models/transaction", () => ({
  default: {
    findById: mockState.transactionFindById,
    findOne: mockState.transactionFindOne,
    findOneAndUpdate: mockState.transactionFindOneAndUpdate,
    create: mockState.transactionCreate,
  },
}))

vi.mock("@/app/api/lib/models/user", () => ({
  default: {
    findOne: mockState.userFindOne,
  },
}))

vi.mock("@/app/api/lib/services/subscription", () => ({
  activateUserSubscriptionFromPayment: mockState.activateUserSubscriptionFromPayment,
  markUserSubscriptionPastDue: mockState.markUserSubscriptionPastDue,
}))

vi.mock("@/app/api/lib/services/stripe", () => ({
  convertMinorToMajorAmount: (value: number | null | undefined) =>
    typeof value === "number" ? Number((value / 100).toFixed(2)) : null,
  getStripeClient: mockState.getStripeClient,
  getStripeWebhookSecret: mockState.getStripeWebhookSecret,
}))

import { POST } from "@/app/api/webhook/stripe/route"

describe("stripe webhook route", () => {
  beforeEach(() => {
    mockState.connectMongo.mockReset()
    mockState.getStripeClient.mockReset()
    mockState.getStripeWebhookSecret.mockReset()
    mockState.constructEvent.mockReset()
    mockState.paymentIntentsRetrieve.mockReset()
    mockState.invoicesRetrieve.mockReset()
    mockState.transactionFindById.mockReset()
    mockState.transactionFindOne.mockReset()
    mockState.transactionFindOneAndUpdate.mockReset()
    mockState.transactionCreate.mockReset()
    mockState.simpleInvoiceFindById.mockReset()
    mockState.userFindOne.mockReset()
    mockState.activateUserSubscriptionFromPayment.mockReset()
    mockState.markUserSubscriptionPastDue.mockReset()

    mockState.getStripeWebhookSecret.mockReturnValue("whsec_test")
    mockState.getStripeClient.mockReturnValue({
      webhooks: {
        constructEvent: mockState.constructEvent,
      },
      paymentIntents: {
        retrieve: mockState.paymentIntentsRetrieve,
      },
      invoices: {
        retrieve: mockState.invoicesRetrieve,
      },
    })
  })

  it("rejects webhook requests without stripe signature", async () => {
    const response = await POST(
      new Request("http://localhost/api/webhook/stripe", {
        method: "POST",
        body: JSON.stringify({}),
      }) as any,
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe("Missing stripe-signature")
  })

  it("processes checkout completion and activates subscription", async () => {
    const transactionRecord = {
      metadata: { stripePriceId: "price_123" },
      save: vi.fn(),
    } as any

    mockState.transactionFindById.mockResolvedValue(transactionRecord)
    mockState.constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          metadata: {
            transactionId: "txn_123",
            clerkUid: "user_123",
            plan: "starter",
            billingCycle: "monthly",
          },
          client_reference_id: "user_123",
          amount_total: 129900,
          currency: "usd",
          payment_intent: null,
          invoice: null,
          subscription: "sub_123",
          customer: "cus_123",
        },
      },
    })

    const response = await POST(
      new Request("http://localhost/api/webhook/stripe", {
        method: "POST",
        headers: {
          "stripe-signature": "sig_test",
        },
        body: "raw-payload",
      }) as any,
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockState.connectMongo).toHaveBeenCalledTimes(1)
    expect(mockState.activateUserSubscriptionFromPayment).toHaveBeenCalledWith(
      "user_123",
      expect.objectContaining({
        plan: "starter",
        billingCycle: "monthly",
        stripeSubscriptionId: "sub_123",
        stripeCustomerId: "cus_123",
        stripePriceId: "price_123",
      }),
    )
    expect(transactionRecord.save).toHaveBeenCalledTimes(1)
  })
})
