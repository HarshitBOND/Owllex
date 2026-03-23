import Razorpay from "razorpay"
import { SubscriptionBillingCycle, SubscriptionPlan } from "@/app/api/lib/services/subscription"

type BillablePlan = Exclude<SubscriptionPlan, "free">

const BILLABLE_PLAN_SET = new Set<BillablePlan>(["starter", "professional", "enterprise"])

const RAZORPAY_AMOUNT_ENV_MAP: Record<BillablePlan, Record<SubscriptionBillingCycle, string>> = {
  starter: {
    monthly: "RAZORPAY_AMOUNT_STARTER_MONTHLY",
    yearly: "RAZORPAY_AMOUNT_STARTER_YEARLY",
  },
  professional: {
    monthly: "RAZORPAY_AMOUNT_PROFESSIONAL_MONTHLY",
    yearly: "RAZORPAY_AMOUNT_PROFESSIONAL_YEARLY",
  },
  enterprise: {
    monthly: "RAZORPAY_AMOUNT_ENTERPRISE_MONTHLY",
    yearly: "RAZORPAY_AMOUNT_ENTERPRISE_YEARLY",
  },
}

let razorpayClient: Razorpay | null = null

const isBillablePlan = (value: SubscriptionPlan): value is BillablePlan =>
  BILLABLE_PLAN_SET.has(value as BillablePlan)

const parseMajorAmountToMinor = (value: string | undefined) => {
  const normalizedValue = value?.trim()
  if (!normalizedValue) {
    return null
  }

  const parsedAmount = Number(normalizedValue)
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return null
  }

  return Math.round(parsedAmount * 100)
}

export function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim()
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim()

  if (!keyId || !keySecret) {
    return null
  }

  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    })
  }

  return razorpayClient
}

export function getRazorpayKeyId() {
  return process.env.RAZORPAY_KEY_ID?.trim() || ""
}

export function getRazorpayWebhookSecret() {
  return process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || ""
}

export function getRazorpayPlanAmountMinor(plan: SubscriptionPlan, billingCycle: SubscriptionBillingCycle) {
  if (!isBillablePlan(plan)) {
    return null
  }

  const envKey = RAZORPAY_AMOUNT_ENV_MAP[plan][billingCycle]
  return parseMajorAmountToMinor(process.env[envKey])
}

export function getRazorpayCheckoutBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || "http://localhost:3000"
}

export function convertMinorToMajorAmount(minorAmount?: number | null) {
  if (!Number.isFinite(minorAmount)) {
    return null
  }

  return Number((Number(minorAmount) / 100).toFixed(2))
}
