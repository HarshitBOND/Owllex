import { describe, expect, it } from "vitest"
import {
  addInvoicePaymentSchema,
  createCaseSchema,
  createClientSchema,
  createInvoiceSchema,
  deleteTaskSchema,
  upsertTaskSchema,
  updateClientSchema,
  updateInvoiceSchema,
} from "@/app/api/lib/validators/userdetails"

describe("Userdetails validation schemas", () => {
  it("validates case create payload", () => {
    const parsed = createCaseSchema.safeParse({
      caseId: "507f1f77bcf86cd799439011",
      client: "507f1f77bcf86cd799439012",
      fileNumber: "FN-001",
    })

    expect(parsed.success).toBe(true)
  })

  it("rejects invalid client update payload", () => {
    const parsed = updateClientSchema.safeParse({
      _id: "bad-id",
      email: "not-an-email",
    })

    expect(parsed.success).toBe(false)
  })

  it("validates client create payload", () => {
    const parsed = createClientSchema.safeParse({
      salutation: "mr",
      name: "Rahul Sharma",
      email: "rahul@example.com",
      contact: "9999999999",
      company: "Ravenslaw LLP",
      address: {
        city: "New Delhi",
      },
      customFields: [{ name: "segment", value: "priority" }],
    })

    expect(parsed.success).toBe(true)
  })

  it("validates task upsert and delete payloads", () => {
    const upsertParsed = upsertTaskSchema.safeParse({
      _id: "507f1f77bcf86cd799439010",
      task: "Prepare hearing brief",
      caseId: "507f1f77bcf86cd799439011",
      dueDate: "2026-03-31",
      status: "pending",
      priority: "high",
      category: "hearing",
    })

    const deleteParsed = deleteTaskSchema.safeParse({
      _id: "507f1f77bcf86cd799439010",
    })

    expect(upsertParsed.success).toBe(true)
    expect(deleteParsed.success).toBe(true)
  })

  it("validates invoice create/update/payment payloads", () => {
    const createParsed = createInvoiceSchema.safeParse({
      clientName: "Acme Pvt Ltd",
      clientEmail: "finance@acme.test",
      issueDate: "2026-03-01",
      dueDate: "2026-03-31",
      items: [{ description: "Litigation services", quantity: 1, rate: 5000, amount: 5000 }],
      subtotal: 5000,
      tax: 0,
      taxRate: 0,
      discount: 0,
      total: 5000,
      status: "draft",
    })

    const updateParsed = updateInvoiceSchema.safeParse({
      notes: "Please process this invoice before due date",
      sendEmail: true,
      createPaymentLink: false,
    })

    const paymentParsed = addInvoicePaymentSchema.safeParse({
      amount: 500,
      method: "upi",
      reference: "UPI123",
    })

    expect(createParsed.success).toBe(true)
    expect(updateParsed.success).toBe(true)
    expect(paymentParsed.success).toBe(true)
  })
})
