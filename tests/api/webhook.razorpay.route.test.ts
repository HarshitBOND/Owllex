import crypto from "crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockState = vi.hoisted(() => ({
  connectMongo: vi.fn(),
  getRazorpayWebhookSecret: vi.fn(),
  transactionFindById: vi.fn(),
  transactionFindOne: vi.fn(),
  simpleInvoiceFindById: vi.fn(),
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
  },
}))

vi.mock("@/app/api/lib/services/subscription", () => ({
  activateUserSubscriptionFromPayment: mockState.activateUserSubscriptionFromPayment,
  markUserSubscriptionPastDue: mockState.markUserSubscriptionPastDue,
}))

vi.mock("@/app/api/lib/services/razorpay", () => ({
  getRazorpayWebhookSecret: mockState.getRazorpayWebhookSecret,
  convertMinorToMajorAmount: (value: number | null | undefined) =>
    typeof value === "number" ? Number((value / 100).toFixed(2)) : null,
}))

import { POST } from "@/app/api/webhook/razorpay/route"

describe("razorpay webhook route", () => {
  beforeEach(() => {
    mockState.connectMongo.mockReset()
    mockState.getRazorpayWebhookSecret.mockReset()
    mockState.transactionFindById.mockReset()
    mockState.transactionFindOne.mockReset()
    mockState.simpleInvoiceFindById.mockReset()
    mockState.activateUserSubscriptionFromPayment.mockReset()
    mockState.markUserSubscriptionPastDue.mockReset()

    mockState.getRazorpayWebhookSecret.mockReturnValue("rzpsec_test")
  })

  it("rejects missing webhook signature", async () => {
    const payload = JSON.stringify({ event: "payment.captured" })

    const response = await POST(
      new Request("http://localhost/api/webhook/razorpay", {
        method: "POST",
        body: payload,
      }) as any,
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe("Missing x-razorpay-signature")
  })

  it("processes captured subscription payment", async () => {
    const transactionRecord = {
      status: "pending",
      paymentGateway: "razorpay",
      gatewayTransactionId: null,
      checkoutSessionId: null,
      failureReason: "",
      currency: "INR",
      amount: 0,
      metadata: {},
      save: vi.fn(),
    } as any

    mockState.transactionFindById.mockReturnValue({
      exec: vi.fn().mockResolvedValue(transactionRecord),
    })

    const payloadObject = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_123",
            amount: 99900,
            currency: "INR",
            method: "upi",
            payment_link_id: "plink_123",
            notes: {
              paymentType: "subscription",
              clerkUid: "user_123",
              plan: "starter",
              billingCycle: "monthly",
              transactionId: "txn_123",
            },
          },
        },
      },
    }

    const payload = JSON.stringify(payloadObject)
    const signature = crypto.createHmac("sha256", "rzpsec_test").update(payload).digest("hex")

    const response = await POST(
      new Request("http://localhost/api/webhook/razorpay", {
        method: "POST",
        headers: {
          "x-razorpay-signature": signature,
        },
        body: payload,
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
      }),
    )
    expect(transactionRecord.save).toHaveBeenCalledTimes(1)
  })
})
