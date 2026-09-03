"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useUser } from "@clerk/nextjs"
import {
  BellRing, CreditCard, Gauge, Loader2, Search, UserRound, X, type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useSettingsData } from "./hooks/useSettingsData"
import { assistantSections, defaultAssistantToggles } from "./data/assistantSections"
import { AssistantPanel } from "./components/AssistantPanel"
import { BillingPanel } from "./components/BillingPanel"
import { GeneralPanel } from "./components/GeneralPanel"
import { NotificationsPanel } from "./components/NotificationsPanel"
import { UsagePanel } from "./components/UsagePanel"

type NavItem = { id: string; name: string; icon: LucideIcon }
type NavGroup = { label: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    label: "Settings",
    items: [
      { id: "general", name: "General", icon: UserRound },
      { id: "notifications", name: "Notifications", icon: BellRing },
      { id: "billing", name: "Billing", icon: CreditCard },
      { id: "usage", name: "Usage", icon: Gauge },
    ],
  },
  {
    label: "Assistant",
    items: assistantSections.map((section) => ({ id: section.id, name: section.name, icon: section.icon })),
  },
]

const allItems = navGroups.flatMap((group) => group.items)

/** Unknown ids (a stale deep link, a typo) land on General rather than an empty pane. */
export const resolveSection = (id: string) => (allItems.some((item) => item.id === id) ? id : "general")

interface SettingsModalProps {
  section: string
  onSectionChange: (section: string) => void
  onClose: () => void
}

export function SettingsModal({ section, onSectionChange, onClose }: SettingsModalProps) {
  const { isLoaded, isSignedIn } = useUser()
  const panelRef = useRef<HTMLDivElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState("")
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [toggles, setToggles] = useState(defaultAssistantToggles)

  const activeId = resolveSection(section)

  const {
    loading,
    accountSaving,
    notificationSaving,
    subscriptionLoading,
    accountNotice,
    notificationNotice,
    billingNotice,
    account,
    setAccount,
    notificationPreferences,
    setNotificationPreferences,
    subscription,
    transactions,
    fetchSettingsData,
    saveAccountSettings,
    saveNotificationSettings,
    handleReminderToggle,
    runSubscriptionAction,
  } = useSettingsData(isSignedIn)

  // Escape closes, and the page behind the overlay must not scroll with it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // Switching section starts the new pane at the top, not mid-scroll.
  useEffect(() => {
    if (paneRef.current) paneRef.current.scrollTop = 0
  }, [activeId])

  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return navGroups
    return navGroups
      .map((group) => ({ ...group, items: group.items.filter((item) => item.name.toLowerCase().includes(needle)) }))
      .filter((group) => group.items.length > 0)
  }, [query])

  if (isLoaded && !isSignedIn) return null

  const assistantSection = assistantSections.find((item) => item.id === activeId)

  const renderPanel = () => {
    if (assistantSection) {
      return (
        <AssistantPanel
          section={assistantSection}
          choices={choices}
          onChoice={(key, value) => setChoices((previous) => ({ ...previous, [key]: value }))}
          toggles={toggles}
          onToggle={(key, value) => setToggles((previous) => ({ ...previous, [key]: value }))}
        />
      )
    }

    if (activeId === "usage") return <UsagePanel />

    if (loading) {
      return (
        <div className="py-16 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      )
    }

    if (activeId === "notifications") {
      return (
        <NotificationsPanel
          notificationPreferences={notificationPreferences}
          setNotificationPreferences={setNotificationPreferences}
          notice={notificationNotice}
          saving={notificationSaving}
          onSave={saveNotificationSettings}
          onReminderToggle={handleReminderToggle}
        />
      )
    }

    if (activeId === "billing") {
      return (
        <BillingPanel
          subscription={subscription}
          transactions={transactions}
          notice={billingNotice}
          loading={subscriptionLoading}
          onRunSubscriptionAction={runSubscriptionAction}
          onRefresh={fetchSettingsData}
        />
      )
    }

    return (
      <GeneralPanel
        account={account}
        setAccount={setAccount}
        notice={accountNotice}
        saving={accountSaving}
        onSave={saveAccountSettings}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center sm:p-6">
      <div
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className={cn(
          "relative flex flex-col sm:flex-row w-full h-full outline-none",
          "sm:h-[min(680px,88vh)] sm:max-w-[1000px] sm:rounded-2xl",
          "bg-white dark:bg-card sm:border border-gray-200 dark:border-border shadow-2xl overflow-hidden",
          "animate-in fade-in zoom-in-95 duration-150",
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="absolute right-3 top-3 z-20 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-muted transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Left rail */}
        <aside className="sm:w-56 shrink-0 border-b sm:border-b-0 sm:border-r border-gray-100 dark:border-border bg-gray-50/70 dark:bg-muted/30 p-3">
          <div className="relative mb-3 pr-11 sm:pr-0">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search settings"
              className="h-9 w-full rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-input pl-8 pr-3 text-[13px] text-gray-800 dark:text-foreground placeholder:text-gray-400 focus:border-accent focus:outline-none transition-colors"
            />
          </div>

          <nav className="flex sm:flex-col gap-3 sm:gap-0 overflow-x-auto sm:overflow-visible">
            {filteredGroups.map((group) => (
              <div key={group.label} className="sm:mb-4 shrink-0">
                <p className="hidden sm:block text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-muted-foreground px-3 mb-1">
                  {group.label}
                </p>
                <div className="flex sm:flex-col gap-1">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSectionChange(item.id)}
                      aria-current={item.id === activeId ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] whitespace-nowrap transition-colors text-left",
                        item.id === activeId
                          ? "bg-gray-200/70 dark:bg-accent/15 text-gray-900 dark:text-foreground font-medium"
                          : "text-gray-600 dark:text-muted-foreground hover:bg-gray-200/50 dark:hover:bg-card",
                      )}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {filteredGroups.length === 0 ? (
              <p className="px-3 py-2 text-[12.5px] text-gray-400">No matching settings.</p>
            ) : null}
          </nav>
        </aside>

        {/* Content pane */}
        <div ref={paneRef} className="flex-1 min-w-0 overflow-y-auto">
          <div className="px-5 sm:px-8 pt-12 pb-10 max-w-[680px]">{renderPanel()}</div>
        </div>
      </div>
    </div>
  )
}
