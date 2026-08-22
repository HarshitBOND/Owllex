"use client"

import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { Loader2, Settings } from "lucide-react"
import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { AccountPreferencesCard } from "./components/AccountPreferencesCard"
import { NotificationPreferencesCard } from "./components/NotificationPreferencesCard"
import { BillingSettingsCard } from "./components/BillingSettingsCard"
import { useSettingsData } from "./hooks/useSettingsData"

export default function SettingsPage() {
  const { isOpen } = useSidebar()
  const { isLoaded, isSignedIn } = useUser()

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

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-sidebar-primary" />
      </div>
    )
  }

  if (!isSignedIn) {
    return redirect("/")
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className={cn("bg-[#F3F5F9] dark:bg-background min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0", isOpen ? "lg:ml-48" : "lg:ml-12")}>
        <div className="bg-white dark:bg-card border-b border-gray-200 dark:border-border w-full">
          <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
            <Navbar location="Settings" />
            <div className="flex items-center gap-2 mt-1">
              <Settings className="h-5 w-5 text-sidebar-primary" />
              <p className="text-sm text-gray-600 dark:text-muted-foreground">Manage account, notifications, and billing preferences</p>
            </div>
          </div>
        </div>

        <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-6 space-y-5">
          {loading ? (
            <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-border p-10 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-sidebar-primary" />
            </div>
          ) : (
            <>
              <AccountPreferencesCard
                account={account}
                setAccount={setAccount}
                notice={accountNotice}
                saving={accountSaving}
                onSave={saveAccountSettings}
              />

              <NotificationPreferencesCard
                notificationPreferences={notificationPreferences}
                setNotificationPreferences={setNotificationPreferences}
                notice={notificationNotice}
                saving={notificationSaving}
                onSave={saveNotificationSettings}
                onReminderToggle={handleReminderToggle}
              />

              <BillingSettingsCard
                subscription={subscription}
                transactions={transactions}
                notice={billingNotice}
                loading={subscriptionLoading}
                onRunSubscriptionAction={runSubscriptionAction}
                onRefresh={fetchSettingsData}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
