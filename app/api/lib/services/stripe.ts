import Stripe from "stripe"
import { SubscriptionBillingCycle, SubscriptionPlan } from "@/app/api/lib/services/subscription"

type BillablePlan = Exclude<SubscriptionPlan, "trial">

const BILLABLE_PLAN_SET = new Set<BillablePlan>(["starter", "professional", "enterprise"])

const STRIPE_PRICE_ENV_MAP: Record<BillablePlan, Record<SubscriptionBillingCycle, string>> = {
  starter: {
    monthly: "STRIPE_PRICE_STARTER_MONTHLY",
    yearly: "STRIPE_PRICE_STARTER_YEARLY",
  },
  professional: {
    monthly: "STRIPE_PRICE_PROFESSIONAL_MONTHLY",
    yearly: "STRIPE_PRICE_PROFESSIONAL_YEARLY",
  },
  enterprise: {
    monthly: "STRIPE_PRICE_ENTERPRISE_MONTHLY",
    yearly: "STRIPE_PRICE_ENTERPRISE_YEARLY",
  },
}

let stripeClient: Stripe | null = null

const isBillablePlan = (value: SubscriptionPlan): value is BillablePlan => BILLABLE_PLAN_SET.has(value as BillablePlan)

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim()
  if (!secretKey) {
    return null
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey)
  }

  return stripeClient
}

export function getStripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || ""
}

export function getStripePriceId(plan: SubscriptionPlan, billingCycle: SubscriptionBillingCycle) {
  if (!isBillablePlan(plan)) {
    return null
  }

  const envKey = STRIPE_PRICE_ENV_MAP[plan][billingCycle]
  return process.env[envKey]?.trim() || null
}

export function getStripeCheckoutBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || "http://localhost:3000"
}

export function convertMinorToMajorAmount(minorAmount?: number | null) {
  if (!Number.isFinite(minorAmount)) {
    return null
  }

  return Number((Number(minorAmount) / 100).toFixed(2))
}
