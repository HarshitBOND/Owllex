"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { SettingsModal } from "@/features/settings/SettingsModal"

type SettingsContextValue = {
  isOpen: boolean
  section: string
  openSettings: (section?: string) => void
  closeSettings: () => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function useSettingsModal() {
  const context = useContext(SettingsContext)
  if (!context) throw new Error("useSettingsModal must be used inside a SettingsProvider")
  return context
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  // null means closed; any string is the section the panel is showing.
  const [section, setSection] = useState<string | null>(null)

  const openSettings = useCallback((next: string = "general") => setSection(next), [])
  const closeSettings = useCallback(() => setSection(null), [])

  // Settings has no route of its own, so deep links arrive as ?settings=<section>
  // on whatever page the user is already on. Consume it, then strip it from the
  // URL so a refresh or a shared link doesn't reopen the panel unexpectedly.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const requested = params.get("settings")
    if (!requested) return

    setSection(requested)
    params.delete("settings")
    const query = params.toString()
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    )
  }, [])

  const value = useMemo<SettingsContextValue>(
    () => ({ isOpen: section !== null, section: section ?? "general", openSettings, closeSettings }),
    [section, openSettings, closeSettings],
  )

  return (
    <SettingsContext.Provider value={value}>
      {children}
      {section !== null ? (
        <SettingsModal section={section} onSectionChange={setSection} onClose={closeSettings} />
      ) : null}
    </SettingsContext.Provider>
  )
}
