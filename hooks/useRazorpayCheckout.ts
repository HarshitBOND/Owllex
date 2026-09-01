"use client"

import { useState } from "react"
import { toast } from "sonner"

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void
      on: (event: string, handler: (response: unknown) => void) => void
    }
  }
}

const CHECKOUT_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js"

function loadCheckoutScript() {
  return new Promise<boolean>((resolve) => {
    if (typeof window === "undefined") {
      resolve(false)
      return
    }

    if (window.Razorpay) {
      resolve(true)
      return
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SCRIPT_URL}"]`)
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)))
      existing.addEventListener("error", () => resolve(false))
      return
    }

    const script = document.createElement("script")
    script.src = CHECKOUT_SCRIPT_URL
    script.async = true
    script.onload = () => resolve(Boolean(window.Razorpay))
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export function useRazorpayCheckout(options?: { onSuccess?: (plan: string) => void }) {
  const [pendingPlan, setPendingPlan] = useState<string | null>(null)

  async function startCheckout(plan: string, billingCycle: "monthly" | "yearly") {
    if (pendingPlan) {
      return
    }

    setPendingPlan(plan)
    let modalOpened = false

    try {
      const orderResponse = await fetch("/api/userdetails/billing/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, billingCycle }),
      })

      const order = await orderResponse.json().catch(() => null)

      if (orderResponse.status === 401) {
        toast.error("Please sign in to continue with the payment.")
        return
      }

      if (!orderResponse.ok || !order?.success) {
        toast.error(order?.error || "Could not start the payment. Please try again.")
        return
      }

      const scriptLoaded = await loadCheckoutScript()
      if (!scriptLoaded || !window.Razorpay) {
        toast.error("Could not load Razorpay checkout. Check your connection and try again.")
        return
      }

      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amountMinor,
        currency: order.currency,
        order_id: order.orderId,
        name: "Ravenslaw",
        description: `${order.plan} plan (${order.billingCycle})`,
        prefill: order.prefill,
        theme: { color: "#111111" },
        handler: async (response: {
          razorpay_order_id: string
          razorpay_payment_id: string
          razorpay_signature: string
        }) => {
          try {
            const verifyResponse = await fetch("/api/userdetails/billing/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            })

            const verified = await verifyResponse.json().catch(() => null)

            if (!verifyResponse.ok || !verified?.success) {
              toast.error(
                verified?.error ||
                  "We could not verify this payment. If money was debited, contact support with your payment id.",
              )
              return
            }

            toast.success(`Payment successful. Your ${order.plan} plan is now active.`)
            options?.onSuccess?.(order.plan)
          } catch {
            toast.error("Payment verification failed. Please contact support.")
          } finally {
            setPendingPlan(null)
          }
        },
        modal: {
          ondismiss: () => {
            setPendingPlan(null)
            toast.info("Payment cancelled.")
          },
        },
      })

      checkout.on("payment.failed", (response: unknown) => {
        const description = (response as { error?: { description?: string } })?.error?.description
        setPendingPlan(null)
        toast.error(description || "Payment failed. Please try another payment method.")
      })

      checkout.open()
      modalOpened = true
    } catch {
      toast.error("Something went wrong while starting the payment.")
    } finally {
      if (!modalOpened) {
        setPendingPlan(null)
      }
    }
  }

  return { startCheckout, pendingPlan }
}
