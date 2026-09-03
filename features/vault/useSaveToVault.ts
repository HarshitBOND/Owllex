"use client"

import { useState } from "react"
import { toast } from "sonner"

export type SaveToVaultState = "idle" | "saving" | "saved" | "error"

/**
 * Shared "Save to Vault" action for pages that produce or hold a document
 * (contract review, corpus, draft documents, invoices). The endpoint does the
 * actual copy server-side; this just tracks button state and surfaces a toast
 * with a link back to the Vault so the user can find what they just saved.
 */
export function useSaveToVault(defaultEndpoint?: string) {
  const [state, setState] = useState<SaveToVaultState>("idle")

  const save = async (endpointOverride?: string) => {
    const endpoint = endpointOverride ?? defaultEndpoint
    if (!endpoint || state === "saving") return
    setState("saving")
    try {
      const res = await fetch(endpoint, { method: "POST" })
      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.success) {
        setState("error")
        toast.error(data.error || "Could not save to Vault")
        return
      }

      setState("saved")
      toast.success(data.alreadyInVault ? "Already in your Vault" : "Saved to Vault", {
        description: data.document?.filename,
        action: {
          label: "View in Vault",
          onClick: () => window.open("/vault", "_blank", "noreferrer"),
        },
      })
    } catch {
      setState("error")
      toast.error("Could not save to Vault")
    }
  }

  return { state, save }
}
