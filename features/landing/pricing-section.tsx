"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Check, Crown, Sparkles, ArrowRight } from "lucide-react"
import Link from "next/link"

// Keep in sync with PLAN_CONFIG in app/api/lib/services/subscription.ts
const plans = [
  {
    name: "Starter",
    monthly: 2000,
    yearly: 1667,
    description: "For solo practitioners starting out",
    features: [
      "Up to 50 active cases",
      "AI assistant — Fast & Balanced models",
      "₹1,200 of AI usage every month",
      "5 Deep Research runs per month",
      "Index up to 50 documents per month",
      "Cause-list parser & automation",
    ],
    cta: "Get Starter",
    popular: false,
  },
  {
    name: "Professional",
    monthly: 4999,
    yearly: 4166,
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
    popular: true,
  },
  {
    name: "Enterprise",
    monthly: 11999,
    yearly: 9999,
    description: "For firms and heavy research practices",
    features: [
      "Unlimited cases",
      "All AI models, including Capable",
      "₹7,500 of AI usage every month",
      "100 Deep Research runs per month",
      "Index up to 1,000 documents per month",
      "Priority support",
    ],
    cta: "Get Enterprise",
    popular: false,
  },
]

export function PricingSection() {
  const [yearly, setYearly] = useState(false)

  return (
    <section className="py-20 px-4 md:px-6" id="pricing">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-4 py-1.5 text-sm text-amber-700 font-medium mb-4">
          <Sparkles className="h-4 w-4" />
          Simple Pricing
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
          Choose the Right Plan for You
        </h2>
        <p className="text-gray-500 max-w-lg mx-auto">
          Core access is currently available for all users during this release phase.
        </p>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-3 mt-6">
          <span className={yearly ? "text-gray-400 text-sm" : "text-gray-900 text-sm font-medium"}>Monthly</span>
          <button
            onClick={() => setYearly(!yearly)}
            className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${yearly ? "bg-sidebar-primary" : "bg-gray-300"}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${yearly ? "translate-x-6.5" : "translate-x-0.5"}`} />
          </button>
          <span className={yearly ? "text-gray-900 text-sm font-medium" : "text-gray-400 text-sm"}>
            Yearly <span className="text-green-600 font-semibold text-xs">2 months free</span>
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative bg-white rounded-2xl border-2 p-6 transition-all ${
              plan.popular
                ? "border-sidebar-primary shadow-lg scale-[1.03]"
                : "border-gray-200 hover:border-gray-300 hover:shadow-md"
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-sidebar-primary text-white text-xs font-bold px-4 py-1 rounded-full flex items-center gap-1">
                <Crown className="h-3 w-3" /> Most Popular
              </div>
            )}
            <div className="mb-5">
              <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
              <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
            </div>
            <div className="flex items-end gap-1 mb-5">
              <span className="text-4xl font-bold text-gray-900">
                ₹{yearly ? plan.yearly : plan.monthly}
              </span>
              <span className="text-gray-400 text-sm mb-1">/mo</span>
            </div>
            <ul className="space-y-2.5 mb-6">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/sign-up">
              <Button
                className={`w-full ${
                  plan.popular
                    ? "bg-sidebar-primary hover:bg-sidebar-primary/90 text-white"
                    : ""
                }`}
                variant={plan.popular ? "default" : "outline"}
              >
                {plan.cta} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        ))}
      </div>
    </section>
  )
}
