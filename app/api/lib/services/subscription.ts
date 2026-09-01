import User from "@/app/api/lib/models/user"

export const SUBSCRIPTION_PLANS = ["free", "starter", "professional", "enterprise"] as const
export const SUBSCRIPTION_STATUSES = ["active", "cancelled", "expired", "past_due", "trial"] as const
export const SUBSCRIPTION_BILLING_CYCLES = ["monthly", "yearly"] as const

export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number]
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]
export type SubscriptionBillingCycle = (typeof SUBSCRIPTION_BILLING_CYCLES)[number]

type PlanFeatures = {
  parserUpload: boolean
  advancedAutomation: boolean
  prioritySupport: boolean
}

export type AiCaps = {
  window5hPaise: number
  dailyPaise: number
  weeklyPaise: number
  monthlyPaise: number
  deepResearchRunsPerMonth: number
  corpusDocsPerMonth: number
}

type PlanConfig = {
  caseLimit: number | null
  features: PlanFeatures
  aiCaps: AiCaps
}

const DEFAULT_SUBSCRIPTION = {
  plan: "free" as SubscriptionPlan,
  status: "active" as SubscriptionStatus,
  billingCycle: "monthly" as SubscriptionBillingCycle,
  currentPeriodStart: new Date(),
  currentPeriodEnd: null as Date | null,
  renewalDate: null as Date | null,
  cancelAtPeriodEnd: false,
  cancelledAt: null as Date | null,
  stripeCustomerId: null as string | null,
  stripeSubscriptionId: null as string | null,
  stripePriceId: null as string | null,
  lastPaymentError: "",
}

// Caps are in paise of OUR OpenAI cost (see lib/ai/rates.ts).
// Selling prices live in RAZORPAY_AMOUNT_<PLAN>_<CYCLE> env vars:
// starter ₹2,000/mo, professional ₹4,999/mo, enterprise ₹11,999/mo (yearly = 10x).
const PLAN_CONFIG: Record<SubscriptionPlan, PlanConfig> = {
  free: {
    caseLimit: 10,
    features: {
      parserUpload: false,
      advancedAutomation: false,
      prioritySupport: false,
    },
    aiCaps: {
      window5hPaise: 150,
      dailyPaise: 150,
      weeklyPaise: 800,
      monthlyPaise: 4500,
      deepResearchRunsPerMonth: 0,
      corpusDocsPerMonth: 0,
    },
  },
  starter: {
    caseLimit: 50,
    features: {
      parserUpload: true,
      advancedAutomation: true,
      prioritySupport: false,
    },
    aiCaps: {
      window5hPaise: 6000,
      dailyPaise: 12000,
      weeklyPaise: 42000,
      monthlyPaise: 120000,
      deepResearchRunsPerMonth: 5,
      corpusDocsPerMonth: 50,
    },
  },
  professional: {
    caseLimit: 250,
    features: {
      parserUpload: true,
      advancedAutomation: true,
      prioritySupport: true,
    },
    aiCaps: {
      window5hPaise: 15000,
      dailyPaise: 30000,
      weeklyPaise: 105000,
      monthlyPaise: 300000,
      deepResearchRunsPerMonth: 25,
      corpusDocsPerMonth: 250,
    },
  },
  enterprise: {
    caseLimit: null,
    features: {
      parserUpload: true,
      advancedAutomation: true,
      prioritySupport: true,
    },
    aiCaps: {
      window5hPaise: 37500,
      dailyPaise: 75000,
      weeklyPaise: 262500,
      monthlyPaise: 750000,
      deepResearchRunsPerMonth: 100,
      corpusDocsPerMonth: 1000,
    },
  },
}

const ACTIVE_STATUSES = new Set<SubscriptionStatus>(["active", "trial", "past_due"])

const isSubscriptionPlan = (value: unknown): value is SubscriptionPlan =>
  typeof value === "string" && SUBSCRIPTION_PLANS.includes(value as SubscriptionPlan)

const isSubscriptionStatus = (value: unknown): value is SubscriptionStatus =>
  typeof value === "string" && SUBSCRIPTION_STATUSES.includes(value as SubscriptionStatus)

const isBillingCycle = (value: unknown): value is SubscriptionBillingCycle =>
  typeof value === "string" && SUBSCRIPTION_BILLING_CYCLES.includes(value as SubscriptionBillingCycle)

const toDate = (value: unknown) => {
  if (!value) {
    return null
  }

  const dateValue = value instanceof Date ? value : new Date(value as string)
  return Number.isNaN(dateValue.getTime()) ? null : dateValue
}

const toIsoString = (value: unknown) => {
  const parsed = toDate(value)
  return parsed ? parsed.toISOString() : null
}

const getRenewalDate = (billingCycle: SubscriptionBillingCycle) => {
  const nextDate = new Date()

  if (billingCycle === "yearly") {
    nextDate.setFullYear(nextDate.getFullYear() + 1)
  } else {
    nextDate.setMonth(nextDate.getMonth() + 1)
  }

  return nextDate
}

const normalizeSubscription = (subscription: Record<string, unknown> | null | undefined) => {
  const source = subscription || {}

  return {
    plan: isSubscriptionPlan(source.plan) ? source.plan : DEFAULT_SUBSCRIPTION.plan,
    status: isSubscriptionStatus(source.status) ? source.status : DEFAULT_SUBSCRIPTION.status,
    billingCycle: isBillingCycle(source.billingCycle)
      ? source.billingCycle
      : DEFAULT_SUBSCRIPTION.billingCycle,
    currentPeriodStart: toDate(source.currentPeriodStart) || DEFAULT_SUBSCRIPTION.currentPeriodStart,
    currentPeriodEnd: toDate(source.currentPeriodEnd),
    renewalDate: toDate(source.renewalDate),
    cancelAtPeriodEnd:
      typeof source.cancelAtPeriodEnd === "boolean"
        ? source.cancelAtPeriodEnd
        : DEFAULT_SUBSCRIPTION.cancelAtPeriodEnd,
    cancelledAt: toDate(source.cancelledAt),
    stripeCustomerId: typeof source.stripeCustomerId === "string" ? source.stripeCustomerId : null,
    stripeSubscriptionId: typeof source.stripeSubscriptionId === "string" ? source.stripeSubscriptionId : null,
    stripePriceId: typeof source.stripePriceId === "string" ? source.stripePriceId : null,
    lastPaymentError: typeof source.lastPaymentError === "string" ? source.lastPaymentError : "",
  }
}

const getCaseCount = (cases: unknown) => (Array.isArray(cases) ? cases.length : 0)

export type SubscriptionSummary = {
  plan: SubscriptionPlan
  status: SubscriptionStatus
  billingCycle: SubscriptionBillingCycle
  caseLimit: number | null
  casesUsed: number
  casesRemaining: number | null
  canCreateCase: boolean
  isPaidPlan: boolean
  isActive: boolean
  features: PlanFeatures
  aiCaps: AiCaps
  cancelAtPeriodEnd: boolean
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  renewalDate: string | null
  cancelledAt: string | null
  stripeSubscriptionId: string | null
  stripeCustomerId: string | null
  lastPaymentError: string
}

export function buildSubscriptionSummaryFromUserRecord(
  userRecord:
    | {
        subscription?: Record<string, unknown> | null
        cases?: unknown[] | null
      }
    | null,
): SubscriptionSummary {
  const normalized = normalizeSubscription(userRecord?.subscription)
  const planConfig = PLAN_CONFIG[normalized.plan]
  const casesUsed = getCaseCount(userRecord?.cases)
  const isActive = ACTIVE_STATUSES.has(normalized.status)
  const caseLimit = planConfig.caseLimit
  const casesRemaining = caseLimit === null ? null : Math.max(caseLimit - casesUsed, 0)
  const canCreateCase = isActive && (caseLimit === null || casesUsed < caseLimit)

  return {
    plan: normalized.plan,
    status: normalized.status,
    billingCycle: normalized.billingCycle,
    caseLimit,
    casesUsed,
    casesRemaining,
    canCreateCase,
    isPaidPlan: normalized.plan !== "free",
    isActive,
    features: planConfig.features,
    aiCaps: planConfig.aiCaps,
    cancelAtPeriodEnd: normalized.cancelAtPeriodEnd,
    currentPeriodStart: toIsoString(normalized.currentPeriodStart),
    currentPeriodEnd: toIsoString(normalized.currentPeriodEnd),
    renewalDate: toIsoString(normalized.renewalDate),
    cancelledAt: toIsoString(normalized.cancelledAt),
    stripeSubscriptionId: normalized.stripeSubscriptionId || null,
    stripeCustomerId: normalized.stripeCustomerId || null,
    lastPaymentError: normalized.lastPaymentError || "",
  }
}

export async function ensureUserSubscriptionDefaults(clerkUid: string) {
  const user = await User.findOne({ clerkUid }).select("subscription").exec()

  if (!user) {
    return null
  }

  const currentSubscription = ((user as any).subscription || null) as Record<string, unknown> | null
  const normalized = normalizeSubscription(currentSubscription)

  const needsUpdate =
    !currentSubscription ||
    !isSubscriptionPlan(currentSubscription.plan) ||
    !isSubscriptionStatus(currentSubscription.status) ||
    !isBillingCycle(currentSubscription.billingCycle) ||
    typeof currentSubscription.cancelAtPeriodEnd !== "boolean"

  if (needsUpdate) {
    ;(user as any).subscription = normalized
    await user.save()
  }

  return normalized
}

export async function getUserSubscriptionSummary(clerkUid: string): Promise<SubscriptionSummary | null> {
  await ensureUserSubscriptionDefaults(clerkUid)

  const user = await User.findOne({ clerkUid }).select("subscription cases").lean().exec()
  if (!user) {
    return null
  }

  return buildSubscriptionSummaryFromUserRecord(user as any)
}

export async function checkCaseCreationAllowance(clerkUid: string) {
  const subscription = await getUserSubscriptionSummary(clerkUid)

  if (!subscription) {
    return {
      allowed: false,
      reason: "User subscription not found",
      subscription: null,
    }
  }

  if (!subscription.isActive) {
    return {
      allowed: false,
      reason: "Subscription is not active. Renew to continue adding cases.",
      subscription,
    }
  }

  if (!subscription.canCreateCase) {
    return {
      allowed: false,
      reason:
        subscription.caseLimit === null
          ? "Case creation is currently blocked for this subscription"
          : `Case limit reached (${subscription.casesUsed}/${subscription.caseLimit}). Upgrade your plan to add more cases.`,
      subscription,
    }
  }

  return {
    allowed: true,
    reason: null,
    subscription,
  }
}

export async function cancelUserSubscription(clerkUid: string) {
  await ensureUserSubscriptionDefaults(clerkUid)

  await User.updateOne(
    { clerkUid },
    {
      $set: {
        "subscription.status": "cancelled",
        "subscription.cancelAtPeriodEnd": false,
        "subscription.cancelledAt": new Date(),
        "subscription.renewalDate": null,
      },
    },
  ).exec()

  return getUserSubscriptionSummary(clerkUid)
}

export async function renewUserSubscription(clerkUid: string) {
  await ensureUserSubscriptionDefaults(clerkUid)

  const current = await getUserSubscriptionSummary(clerkUid)
  const billingCycle: SubscriptionBillingCycle = current?.billingCycle || "monthly"
  const currentPeriodStart = new Date()

  await User.updateOne(
    { clerkUid },
    {
      $set: {
        "subscription.status": "active",
        "subscription.cancelAtPeriodEnd": false,
        "subscription.cancelledAt": null,
        "subscription.currentPeriodStart": currentPeriodStart,
        "subscription.currentPeriodEnd": null,
        "subscription.renewalDate": getRenewalDate(billingCycle),
      },
    },
  ).exec()

  return getUserSubscriptionSummary(clerkUid)
}

export async function changeUserSubscriptionPlan(
  clerkUid: string,
  plan: SubscriptionPlan,
  billingCycle?: SubscriptionBillingCycle,
) {
  await ensureUserSubscriptionDefaults(clerkUid)

  const current = await getUserSubscriptionSummary(clerkUid)
  const selectedBillingCycle: SubscriptionBillingCycle = billingCycle || current?.billingCycle || "monthly"
  const currentPeriodStart = new Date()

  await User.updateOne(
    { clerkUid },
    {
      $set: {
        "subscription.plan": plan,
        "subscription.status": "active",
        "subscription.billingCycle": selectedBillingCycle,
        "subscription.cancelAtPeriodEnd": false,
        "subscription.cancelledAt": null,
        "subscription.currentPeriodStart": currentPeriodStart,
        "subscription.currentPeriodEnd": null,
        "subscription.renewalDate": getRenewalDate(selectedBillingCycle),
      },
    },
  ).exec()

  return getUserSubscriptionSummary(clerkUid)
}

export async function activateUserSubscriptionFromPayment(
  clerkUid: string,
  payload: {
    plan: SubscriptionPlan
    billingCycle: SubscriptionBillingCycle
    stripeCustomerId?: string | null
    stripeSubscriptionId?: string | null
    stripePriceId?: string | null
    renewalDate?: Date | null
  },
) {
  await ensureUserSubscriptionDefaults(clerkUid)

  const currentPeriodStart = new Date()
  const renewalDate = payload.renewalDate || getRenewalDate(payload.billingCycle)

  await User.updateOne(
    { clerkUid },
    {
      $set: {
        "subscription.plan": payload.plan,
        "subscription.status": "active",
        "subscription.billingCycle": payload.billingCycle,
        "subscription.cancelAtPeriodEnd": false,
        "subscription.cancelledAt": null,
        "subscription.currentPeriodStart": currentPeriodStart,
        "subscription.currentPeriodEnd": null,
        "subscription.renewalDate": renewalDate,
        "subscription.stripeCustomerId": payload.stripeCustomerId || null,
        "subscription.stripeSubscriptionId": payload.stripeSubscriptionId || null,
        "subscription.stripePriceId": payload.stripePriceId || null,
        "subscription.lastPaymentError": "",
      },
    },
  ).exec()

  return getUserSubscriptionSummary(clerkUid)
}

export async function markUserSubscriptionPastDue(clerkUid: string, reason?: string | null) {
  await ensureUserSubscriptionDefaults(clerkUid)

  await User.updateOne(
    { clerkUid },
    {
      $set: {
        "subscription.status": "past_due",
        "subscription.lastPaymentError": (reason || "Payment failed").slice(0, 500),
      },
    },
  ).exec()

  return getUserSubscriptionSummary(clerkUid)
}