"use client"

import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { PricingSection } from "@/components/ui/pricing-section"
import type { PricingTier } from "@/components/ui/pricing-card"
import { useRazorpayCheckout } from "@/hooks/useRazorpayCheckout"

const PAYMENT_FREQUENCIES = ["monthly", "yearly"]

// Keep in sync with PLAN_CONFIG in app/api/lib/services/subscription.ts
const TIERS: PricingTier[] = [
  {
    id: "trial",
    name: "7-Day Trial",
    price: { monthly: "7 days free", yearly: "7 days free" },
    description: "Try Ravenslaw on a single matter, no credit card required",
    features: [
      "Up to 3 active cases",
      "Fast AI model only",
      "₹100 of AI usage every month",
      "Index up to 5 documents",
      "Cause-list lookup",
      "Full access for 7 days, then choose a plan",
    ],
    cta: "Start 7-day trial",
    href: "/sign-up",
  },
  {
    id: "starter",
    name: "Starter",
    price: { monthly: 2000, yearly: 1667 },
    description: "For solo practitioners starting out",
    features: [
      "Up to 50 active cases",
      "Fast & Balanced AI models",
      "₹1,200 of AI usage every month",
      "5 Deep Research runs per month",
      "Index up to 50 documents per month",
      "Cause-list parser & automation",
    ],
    cta: "Get Starter",
    href: "/sign-up?plan=starter",
  },
  {
    id: "professional",
    name: "Professional",
    price: { monthly: 4999, yearly: 4166 },
    description: "For advocates who use AI daily",
    features: [
      "Up to 250 active cases",
      "All AI models, including Capable",
      "₹3,000 of AI usage every month",
      "25 Deep Research runs per month",
      "Index up to 250 documents per month",
      "Priority support",
    ],
    cta: "Get Professional",
    href: "/sign-up?plan=professional",
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: { monthly: 11999, yearly: 9999 },
    description: "For firms and heavy research practices",
    features: [
      "Unlimited cases",
      "All AI models, including Capable",
      "₹7,500 of AI usage every month",
      "100 Deep Research runs per month",
      "Index up to 1,000 documents per month",
      "Dedicated onboarding & support",
    ],
    cta: "Contact us",
    href: "/contact-us",
    highlighted: true,
  },
]

const PAID_PLANS = new Set(["starter", "professional"])

export default function PricingPage() {
  const router = useRouter()
  const { isSignedIn, isLoaded } = useUser()
  const { startCheckout, pendingPlan } = useRazorpayCheckout({
    onSuccess: () => router.push("/dashboard?billing=success"),
  })

  const handleSelect = (tier: PricingTier, paymentFrequency: string) => {
    if (!tier.id || !PAID_PLANS.has(tier.id)) {
      router.push(tier.href ?? "/sign-up")
      return
    }

    if (isLoaded && !isSignedIn) {
      router.push(`/sign-up?plan=${tier.id}`)
      return
    }

    startCheckout(tier.id, paymentFrequency === "yearly" ? "yearly" : "monthly")
  }

  return (
    <main className="min-h-screen">
      <Header />
      <div className="relative flex w-full items-center justify-center px-4 py-10">
        <div className="absolute inset-0 -z-10">
          <div className="h-full w-full bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:35px_35px] opacity-30 [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
        </div>
        <PricingSection
          title="Simple Pricing"
          subtitle="Every account starts with a free 7-day trial. Choose the plan that fits your practice after that."
          frequencies={PAYMENT_FREQUENCIES}
          tiers={TIERS}
          currency="INR"
          pendingTierId={pendingPlan}
          onSelect={handleSelect}
        />
      </div>
      <Footer />
    </main>
  )
}
