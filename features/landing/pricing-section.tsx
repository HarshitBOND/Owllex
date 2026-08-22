"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Check, Crown, Sparkles, ArrowRight } from "lucide-react"
import Link from "next/link"

const plans = [
  {
    name: "Starter",
    monthly: 99,
    yearly: 79,
    description: "Perfect for solo practitioners starting out",
    features: [
      "Up to 25 active cases",
      "50 client profiles",
      "Basic case tracking",
      "Document generation",
      "Email support",
    ],
    cta: "Get Started Free",
    popular: false,
  },
  {
    name: "Professional",
    monthly: 299,
    yearly: 239,
    description: "For growing law firms with active caseloads",
    features: [
      "Unlimited cases",
      "Unlimited clients",
      "Advanced analytics",
      "Invoice management",
      "AI legal assistant",
      "Priority support",
    ],
    cta: "Get Professional",
    popular: true,
  },
  {
    name: "Enterprise",
    monthly: 999,
    yearly: 799,
    description: "For large firms and legal departments",
    features: [
      "Everything in Professional",
      "Multi-user teams",
      "Custom workflows",
      "API access",
      "Dedicated account manager",
      "SLA guarantee",
    ],
    cta: "Contact Sales",
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
            Yearly <span className="text-green-600 font-semibold text-xs">Save 20%</span>
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
