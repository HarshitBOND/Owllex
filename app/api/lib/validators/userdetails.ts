import { z } from "zod"

const optionalTrimmedString = (max: number) => z.string().trim().max(max).optional().or(z.literal(""))

export const clientAddressSchema = z
  .object({
    building: optionalTrimmedString(120),
    street: optionalTrimmedString(120),
    city: optionalTrimmedString(80),
    district: optionalTrimmedString(80),
    state: optionalTrimmedString(80),
    pincode: optionalTrimmedString(20),
    country: optionalTrimmedString(80),
  })
  .partial()
  .default({})

export const clientCustomFieldSchema = z.object({
  name: z.string().trim().min(1).max(80),
  value: z.string().trim().max(500).optional().default(""),
})

export const createClientSchema = z.object({
  salutation: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2).max(160),
  company: z.string().trim().max(160).optional().default(""),
  email: z.string().trim().email().max(200),
  contact: z.string().trim().min(6).max(30),
  alternateContact: z.string().trim().max(30).optional().default(""),
  gstin: z.string().trim().max(40).optional().default(""),
  group: z.string().trim().max(80).optional().default(""),
  address: clientAddressSchema,
  customFields: z.array(clientCustomFieldSchema).max(20).optional().default([]),
})

export const updateClientSchema = createClientSchema.partial().extend({
  _id: z.string().trim().regex(/^[a-f\d]{24}$/i, "Invalid client id"),
})

export const createCaseSchema = z.object({
  caseId: z.string().trim().regex(/^[a-f\d]{24}$/i, "Invalid case id"),
  client: z.string().trim().regex(/^[a-f\d]{24}$/i, "Invalid client id").optional(),
  fileNumber: z.string().trim().max(100).optional(),
})

export const taskReminderSchema = z
  .object({
    reminderTime: z.string().trim().min(1).max(10),
    reminderTimeUnit: z.string().trim().min(1).max(20),
  })
  .optional()

export const taskFieldsToShowSchema = z
  .object({
    caseInfo: z.boolean().optional(),
    caseName: z.boolean().optional(),
    caseNo: z.boolean().optional(),
  })
  .optional()

export const upsertTaskSchema = z.object({
  _id: z.string().trim().regex(/^[a-f\d]{24}$/i, "Invalid task id").optional(),
  task: z.string().trim().min(2).max(240),
  caseId: z.string().trim().regex(/^[a-f\d]{24}$/i, "Invalid case id").optional().nullable(),
  dueDate: z.union([z.string().trim().min(1), z.date()]),
  dueTime: z.string().trim().max(20).optional(),
  reminder: taskReminderSchema,
  resourceType: z.string().trim().max(60).optional(),
  resourceName: z.string().trim().max(200).optional().nullable(),
  fieldToShow: taskFieldsToShowSchema,
  fieldsToShow: taskFieldsToShowSchema,
  referenceFiles: z.array(z.string().trim().max(500)).optional(),
  status: z.enum(["pending", "completed"]).optional(),
  taskCompletedRemarks: z.string().trim().max(2000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  category: z
    .enum([
      "hearing",
      "filing",
      "deposition",
      "client-meeting",
      "research",
      "case-review",
      "motion",
      "discovery",
    ])
    .optional(),
})

export const deleteTaskSchema = z.object({
  _id: z.string().trim().regex(/^[a-f\d]{24}$/i, "Invalid task id"),
})

const invoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(400),
  quantity: z.number().positive(),
  rate: z.number().min(0),
  amount: z.number().min(0),
})

export const createInvoiceSchema = z.object({
  clientId: z.string().trim().regex(/^[a-f\d]{24}$/i, "Invalid client id").optional(),
  clientName: z.string().trim().min(2).max(200),
  clientEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
  clientCompany: z.string().trim().max(200).optional(),
  caseId: z.string().trim().regex(/^[a-f\d]{24}$/i, "Invalid case id").optional(),
  caseTitle: z.string().trim().max(300).optional(),
  issueDate: z.union([z.string().trim().min(1), z.date()]),
  dueDate: z.union([z.string().trim().min(1), z.date()]),
  items: z.array(invoiceItemSchema).min(1).max(100),
  subtotal: z.number().min(0),
  tax: z.number().min(0).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  discount: z.number().min(0).optional(),
  currency: z.string().trim().min(3).max(10).optional(),
  total: z.number().min(0),
  notes: z.string().trim().max(4000).optional(),
  status: z.enum(["draft", "pending", "paid", "overdue"]).optional(),
})

export const updateInvoiceSchema = createInvoiceSchema
  .partial()
  .extend({
    sendEmail: z.boolean().optional(),
    createPaymentLink: z.boolean().optional(),
    payments: z
      .array(
        z.object({
          amount: z.number().positive(),
          method: z.string().trim().min(1).max(40),
          date: z.union([z.string().trim().min(1), z.date()]).optional(),
          reference: z.string().trim().max(120).optional(),
          notes: z.string().trim().max(1000).optional(),
        }),
      )
      .optional(),
  })

export const addInvoicePaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(["cash", "bank_transfer", "credit_card", "check", "paypal", "upi", "other"]),
  date: z.union([z.string().trim().min(1), z.date()]).optional(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
})

export const createNoteSchema = z.object({
  clientId: z.string().trim().regex(/^[a-f\d]{24}$/i, "Invalid id").optional(),
  caseId: z.string().trim().regex(/^[a-f\d]{24}$/i, "Invalid id").optional(),
  title: z.string().trim().max(200).optional(),
  visibility: z.string().trim().max(50).optional(),
  content: z.string().trim().max(50000).optional(),
  contentJson: z.unknown().optional(),
})
