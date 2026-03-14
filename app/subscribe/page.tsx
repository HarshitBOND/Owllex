"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { Check, Zap, Crown, Building2, ArrowRight, Shield, Clock, HeadphonesIcon, CheckCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const plans = [
  {
    id: "starter",
    name: "Starter",
    description: "Perfect for individual lawyers getting started",
    price: { monthly: 99, yearly: 79 },
    icon: Zap,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    popular: false,
    features: [
      "Up to 5 active cases",
      "Client management",
      "Email notifications",
      "Basic case tracking",
      "Document uploads (5GB)",
      "Calendar integration",
      "Email support",
    ],
    limits: { cases: 5, storage: "5 GB", team: 1 },
  },
  {
    id: "professional",
    name: "Professional",
    description: "Most popular for growing law practices",
    price: { monthly: 299, yearly: 239 },
    icon: Crown,
    color: "text-sidebar-primary",
    bgColor: "bg-teal-50",
    borderColor: "border-sidebar-primary",
    popular: true,
    features: [
      "Up to 50 active cases",
      "Advanced client management",
      "Email + SMS notifications",
      "AI-powered case tracking",
      "Document uploads (100GB)",
      "Automated hearing reminders",
      "Invoice generation",
      "Client portal access",
      "Priority support",
    ],
    limits: { cases: 50, storage: "100 GB", team: 5 },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "For large firms and legal departments",
    price: { monthly: 999, yearly: 799 },
    icon: Building2,
    color: "text-violet-600",
    bgColor: "bg-violet-50",
    borderColor: "border-violet-200",
    popular: false,
    features: [
      "Unlimited active cases",
      "Full client management suite",
      "All notification channels",
      "AI analysis & suggestions",
      "Unlimited storage",
      "White-label client portal",
      "Custom integrations",
      "Team management & roles",
      "Dedicated account manager",
      "SLA guarantee (99.99%)",
    ],
    limits: { cases: "Unlimited", storage: "Unlimited", team: "Unlimited" },
  },
]

export default function SubscribePage() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly")
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const { isLoaded, isSignedIn } = useUser()
  const router = useRouter()

  if (isLoaded && !isSignedIn) {
    return redirect("/")
  }

  return (
    <div className="min-h-screen bg-[#F3F5F9]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-8 md:py-12 text-center">
          <button
            onClick={() => router.back()}
            className="absolute left-4 top-4 md:left-8 md:top-8 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            ← Back
          </button>
          <div className="inline-flex items-center gap-2 bg-sidebar-primary/10 text-sidebar-primary px-4 py-1.5 rounded-full text-sm font-medium mb-4">
            <Crown size={14} />
            Choose Your Plan
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            Pricing that scales with your practice
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto mb-8">
            Start with a 14-day free trial. No credit card required. Upgrade or downgrade at any time.
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setBilling("monthly")}
              className={cn(
                "px-5 py-2 rounded-lg text-sm font-medium transition-all",
                billing === "monthly" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling("yearly")}
              className={cn(
                "px-5 py-2 rounded-lg text-sm font-medium transition-all relative",
                billing === "yearly" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Yearly
              <span className="absolute -top-2 -right-2 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                -20%
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "relative bg-white rounded-2xl border-2 p-6 md:p-8 shadow-sm hover:shadow-lg transition-all duration-300",
                plan.popular ? "border-sidebar-primary scale-[1.02] shadow-md" : "border-gray-200"
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-sidebar-primary text-white text-xs font-bold px-4 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              <div className={cn("inline-flex p-2.5 rounded-xl mb-4", plan.bgColor)}>
                <plan.icon className={cn("h-6 w-6", plan.color)} />
              </div>

              <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
              <p className="text-sm text-gray-500 mt-1 mb-6">{plan.description}</p>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-gray-900">
                    ${plan.price[billing]}
                  </span>
                  <span className="text-gray-500 text-sm">/month</span>
                </div>
                {billing === "yearly" && (
                  <p className="text-xs text-green-600 font-medium mt-1">
                    Save ${(plan.price.monthly - plan.price.yearly) * 12}/year
                  </p>
                )}
              </div>

              <Button
                className={cn(
                  "w-full mb-6",
                  plan.popular
                    ? "bg-sidebar-primary hover:bg-sidebar-primary/90 text-white"
                    : "bg-gray-900 hover:bg-gray-800 text-white"
                )}
                size="lg"
                onClick={() => {
                  setSelectedPlan(plan.id)
                  setTimeout(() => router.push("/dashboard"), 1500)
                }}
              >
                {selectedPlan === plan.id ? (
                  <><CheckCircle className="h-4 w-4 mr-2" /> Trial Activated!</>
                ) : (
                  <>Start Free Trial <ArrowRight className="h-4 w-4 ml-2" /></>
                )}
              </Button>

              <div className="space-y-3">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3">
                    <Check className={cn("h-4 w-4 mt-0.5 flex-shrink-0", plan.color)} />
                    <span className="text-sm text-gray-600">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Trust Section */}
        <div className="mt-16 grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="text-center">
            <div className="inline-flex p-3 bg-green-50 rounded-xl mb-3">
              <Shield className="h-6 w-6 text-green-600" />
            </div>
            <h4 className="font-semibold text-gray-900 mb-1">Secure & Compliant</h4>
            <p className="text-sm text-gray-500">Enterprise-grade security with end-to-end encryption</p>
          </div>
          <div className="text-center">
            <div className="inline-flex p-3 bg-blue-50 rounded-xl mb-3">
              <Clock className="h-6 w-6 text-blue-600" />
            </div>
            <h4 className="font-semibold text-gray-900 mb-1">14-Day Free Trial</h4>
            <p className="text-sm text-gray-500">Full access to all features, no credit card required</p>
          </div>
          <div className="text-center">
            <div className="inline-flex p-3 bg-violet-50 rounded-xl mb-3">
              <HeadphonesIcon className="h-6 w-6 text-violet-600" />
            </div>
            <h4 className="font-semibold text-gray-900 mb-1">24/7 Support</h4>
            <p className="text-sm text-gray-500">Dedicated support team for all your questions</p>
          </div>
        </div>

        {/* FAQ-like section */}
        <div className="mt-16 text-center">
          <p className="text-gray-500">
            Have questions? <button onClick={() => router.push("/contact-us")} className="text-sidebar-primary font-medium hover:underline">Contact our team</button>
          </p>
        </div>
      </div>
    </div>
  )
}
