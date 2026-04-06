"use client"

import { useCallback, useEffect, useState } from "react"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  BellRing,
  CheckCircle2,
  CircleAlert,
  Loader2,
  ReceiptText,
  Settings,
  UserRound,
} from "lucide-react"

type NoticeState = {
  kind: "success" | "error"
  message: string
} | null

interface AccountSettingsState {
  firstName: string
  lastName: string
  email: string
  defaultLandingPage: "/dashboard" | "/case-tracking" | "/tasks" | "/invoices"
  weeklyDigestEnabled: boolean
  showBillingSummary: boolean
}

interface NotificationPreferencesState {
  emailEnabled: boolean
  timezone: string
  sendWindowStartHour: number
  sendWindowEndHour: number
  reminderOffsets: number[]
}

interface SubscriptionState {
  plan: string
  status: string
  billingCycle: string
  caseLimit: number | null
  casesUsed: number
  casesRemaining: number | null
  renewalDate: string | null
  cancelAtPeriodEnd: boolean
}

interface BillingTransaction {
  _id: string
  amount: number
  currency: string
  status: string
  paymentGateway: string
  description?: string
  failureReason?: string
  receiptUrl?: string | null
  invoiceUrl?: string | null
  createdAt: string
}

const defaultAccountState: AccountSettingsState = {
  firstName: "",
  lastName: "",
  email: "",
  defaultLandingPage: "/dashboard",
  weeklyDigestEnabled: false,
  showBillingSummary: true,
}

const defaultNotificationState: NotificationPreferencesState = {
  emailEnabled: true,
  timezone: "Asia/Kolkata",
  sendWindowStartHour: 8,
  sendWindowEndHour: 20,
  reminderOffsets: [7, 3, 1],
}

const hourOptions = Array.from({ length: 24 }, (_, index) => index)

function formatHour(value: number) {
  const suffix = value >= 12 ? "PM" : "AM"
  const normalized = value % 12 === 0 ? 12 : value % 12
  return `${normalized}:00 ${suffix}`
}

function formatAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 2,
    }).format(Number(amount || 0))
  } catch {
    return `${currency || "INR"} ${Number(amount || 0).toFixed(2)}`
  }
}

function formatDateValue(dateValue?: string | null) {
  if (!dateValue) return "—"

  return new Date(dateValue).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function SettingsPage() {
  const { isOpen } = useSidebar()
  const { isLoaded, isSignedIn } = useUser()

  const [loading, setLoading] = useState(true)
  const [accountSaving, setAccountSaving] = useState(false)
  const [notificationSaving, setNotificationSaving] = useState(false)
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)

  const [accountNotice, setAccountNotice] = useState<NoticeState>(null)
  const [notificationNotice, setNotificationNotice] = useState<NoticeState>(null)
  const [billingNotice, setBillingNotice] = useState<NoticeState>(null)

  const [account, setAccount] = useState<AccountSettingsState>(defaultAccountState)
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferencesState>(defaultNotificationState)
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null)
  const [transactions, setTransactions] = useState<BillingTransaction[]>([])

  const fetchSettingsData = useCallback(async () => {
    if (!isSignedIn) return

    setLoading(true)

    try {
      const [
        accountResponse,
        notificationResponse,
        subscriptionResponse,
        transactionsResponse,
      ] = await Promise.all([
        fetch("/api/userdetails/settings/account"),
        fetch("/api/userdetails/notifications/preferences"),
        fetch("/api/userdetails/subscription"),
        fetch("/api/userdetails/billing/transactions?limit=8"),
      ])

      const accountData = await accountResponse.json().catch(() => ({}))
      const notificationData = await notificationResponse.json().catch(() => ({}))
      const subscriptionData = await subscriptionResponse.json().catch(() => ({}))
      const transactionsData = await transactionsResponse.json().catch(() => ({}))

      if (accountResponse.ok && accountData?.success) {
        setAccount({
          firstName: accountData.account?.firstName || "",
          lastName: accountData.account?.lastName || "",
          email: accountData.account?.email || "",
          defaultLandingPage:
            accountData.account?.accountPreferences?.defaultLandingPage || "/dashboard",
          weeklyDigestEnabled:
            Boolean(accountData.account?.accountPreferences?.weeklyDigestEnabled),
          showBillingSummary:
            accountData.account?.accountPreferences?.showBillingSummary !== false,
        })
      }

      if (notificationResponse.ok && notificationData?.success) {
        setNotificationPreferences({
          emailEnabled: notificationData.preferences?.emailEnabled !== false,
          timezone: notificationData.preferences?.timezone || "Asia/Kolkata",
          sendWindowStartHour: Number(notificationData.preferences?.sendWindowStartHour ?? 8),
          sendWindowEndHour: Number(notificationData.preferences?.sendWindowEndHour ?? 20),
          reminderOffsets: Array.isArray(notificationData.preferences?.reminderOffsets)
            ? notificationData.preferences.reminderOffsets
            : [7, 3, 1],
        })
      }

      if (subscriptionResponse.ok && subscriptionData?.success) {
        setSubscription(subscriptionData.subscription || null)
      }

      if (transactionsResponse.ok && transactionsData?.success) {
        setTransactions(Array.isArray(transactionsData.transactions) ? transactionsData.transactions : [])
      }
    } catch (error) {
      console.error("Settings data fetch error:", error)
    } finally {
      setLoading(false)
    }
  }, [isSignedIn])

  useEffect(() => {
    if (isSignedIn) {
      fetchSettingsData()
    }
  }, [isSignedIn, fetchSettingsData])

  const saveAccountSettings = async () => {
    setAccountNotice(null)
    setAccountSaving(true)

    try {
      const response = await fetch("/api/userdetails/settings/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: account.firstName,
          lastName: account.lastName,
          defaultLandingPage: account.defaultLandingPage,
          weeklyDigestEnabled: account.weeklyDigestEnabled,
          showBillingSummary: account.showBillingSummary,
        }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to save account preferences")
      }

      setAccountNotice({ kind: "success", message: "Account preferences saved." })
    } catch (error: any) {
      setAccountNotice({
        kind: "error",
        message: error?.message || "Could not save account preferences.",
      })
    } finally {
      setAccountSaving(false)
    }
  }

  const saveNotificationSettings = async () => {
    setNotificationNotice(null)
    setNotificationSaving(true)

    try {
      const response = await fetch("/api/userdetails/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailEnabled: notificationPreferences.emailEnabled,
          timezone: notificationPreferences.timezone,
          sendWindowStartHour: notificationPreferences.sendWindowStartHour,
          sendWindowEndHour: notificationPreferences.sendWindowEndHour,
          reminderOffsets: notificationPreferences.reminderOffsets,
        }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to save notification preferences")
      }

      setNotificationNotice({ kind: "success", message: "Notification preferences saved." })
    } catch (error: any) {
      setNotificationNotice({
        kind: "error",
        message: error?.message || "Could not save notification preferences.",
      })
    } finally {
      setNotificationSaving(false)
    }
  }

  const handleReminderToggle = (offset: number) => {
    const exists = notificationPreferences.reminderOffsets.includes(offset)
    const next = exists
      ? notificationPreferences.reminderOffsets.filter((value) => value !== offset)
      : [...notificationPreferences.reminderOffsets, offset]

    setNotificationPreferences((previous) => ({
      ...previous,
      reminderOffsets: next.sort((a, b) => b - a).slice(0, 3),
    }))
  }

  const runSubscriptionAction = async (action: "cancel" | "renew") => {
    setBillingNotice(null)
    setSubscriptionLoading(true)

    try {
      const response = await fetch("/api/userdetails/subscription", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to update subscription")
      }

      setSubscription(data.subscription || null)
      setBillingNotice({
        kind: "success",
        message: action === "cancel" ? "Subscription set to cancel." : "Subscription renewed.",
      })
      await fetchSettingsData()
    } catch (error: any) {
      setBillingNotice({ kind: "error", message: error?.message || "Could not update subscription." })
    } finally {
      setSubscriptionLoading(false)
    }
  }

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
              <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-1">
                  <UserRound className="h-4 w-4 text-blue-600 dark:text-sky-400" />
                  <h3 className="font-semibold text-gray-900 dark:text-foreground">Account Preferences</h3>
                </div>
                <p className="text-xs text-gray-500 dark:text-muted-foreground mb-4">Update profile metadata and account-level preferences.</p>

                {accountNotice && (
                  <div className={cn(
                    "mb-4 rounded-md border px-3 py-2 text-sm flex items-center gap-2",
                    accountNotice.kind === "success"
                      ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                      : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400",
                  )}>
                    {accountNotice.kind === "success" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <CircleAlert className="h-4 w-4" />
                    )}
                    {accountNotice.message}
                  </div>
                )}

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <Input
                    placeholder="First name"
                    value={account.firstName}
                    onChange={(event) =>
                      setAccount((previous) => ({ ...previous, firstName: event.target.value }))
                    }
                  />
                  <Input
                    placeholder="Last name"
                    value={account.lastName}
                    onChange={(event) =>
                      setAccount((previous) => ({ ...previous, lastName: event.target.value }))
                    }
                  />
                  <Input
                    placeholder="Email"
                    value={account.email}
                    readOnly
                    className="bg-gray-50"
                  />
                </div>

                <div className="grid md:grid-cols-3 gap-3 mt-3">
                  <select
                    value={account.defaultLandingPage}
                    onChange={(event) =>
                      setAccount((previous) => ({
                        ...previous,
                        defaultLandingPage: event.target.value as AccountSettingsState["defaultLandingPage"],
                      }))
                    }
                    className="h-10 rounded-md border border-gray-200 dark:border-border bg-white dark:bg-input px-3 text-sm dark:text-foreground"
                  >
                    <option value="/dashboard">Default Landing: Dashboard</option>
                    <option value="/case-tracking">Default Landing: Case Tracking</option>
                    <option value="/tasks">Default Landing: Tasks</option>
                    <option value="/invoices">Default Landing: Invoices</option>
                  </select>

                  <label className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-border px-3 h-10 text-sm text-gray-700 dark:text-foreground">
                    <input
                      type="checkbox"
                      checked={account.weeklyDigestEnabled}
                      onChange={(event) =>
                        setAccount((previous) => ({
                          ...previous,
                          weeklyDigestEnabled: event.target.checked,
                        }))
                      }
                    />
                    Weekly digest email
                  </label>

                  <label className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-border px-3 h-10 text-sm text-gray-700 dark:text-foreground">
                    <input
                      type="checkbox"
                      checked={account.showBillingSummary}
                      onChange={(event) =>
                        setAccount((previous) => ({
                          ...previous,
                          showBillingSummary: event.target.checked,
                        }))
                      }
                    />
                    Show billing summary on dashboard
                  </label>
                </div>

                <div className="flex justify-end mt-4">
                  <Button onClick={saveAccountSettings} disabled={accountSaving}>
                    {accountSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Account Preferences"
                    )}
                  </Button>
                </div>
              </div>

              <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-1">
                  <BellRing className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  <h3 className="font-semibold text-gray-900 dark:text-foreground">Notification Preferences</h3>
                </div>
                <p className="text-xs text-gray-500 dark:text-muted-foreground mb-4">Set timezone, send window, and reminder offsets.</p>

                {notificationNotice && (
                  <div className={cn(
                    "mb-4 rounded-md border px-3 py-2 text-sm flex items-center gap-2",
                    notificationNotice.kind === "success"
                      ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                      : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400",
                  )}>
                    {notificationNotice.kind === "success" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <CircleAlert className="h-4 w-4" />
                    )}
                    {notificationNotice.message}
                  </div>
                )}

                <div className="grid lg:grid-cols-4 gap-3">
                  <label className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-border px-3 h-10 text-sm text-gray-700 dark:text-foreground lg:col-span-1">
                    <input
                      type="checkbox"
                      checked={notificationPreferences.emailEnabled}
                      onChange={(event) =>
                        setNotificationPreferences((previous) => ({
                          ...previous,
                          emailEnabled: event.target.checked,
                        }))
                      }
                    />
                    Email reminders enabled
                  </label>

                  <Input
                    value={notificationPreferences.timezone}
                    onChange={(event) =>
                      setNotificationPreferences((previous) => ({
                        ...previous,
                        timezone: event.target.value,
                      }))
                    }
                    placeholder="Timezone (e.g. Asia/Kolkata)"
                    className="lg:col-span-3"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-3 mt-3">
                  <select
                    value={notificationPreferences.sendWindowStartHour}
                    onChange={(event) =>
                      setNotificationPreferences((previous) => ({
                        ...previous,
                        sendWindowStartHour: Number(event.target.value),
                      }))
                    }
                    className="h-10 rounded-md border border-gray-200 dark:border-border bg-white dark:bg-input px-3 text-sm dark:text-foreground"
                  >
                    {hourOptions.map((hour) => (
                      <option key={`start-${hour}`} value={hour}>
                        Send window start: {formatHour(hour)}
                      </option>
                    ))}
                  </select>

                  <select
                    value={notificationPreferences.sendWindowEndHour}
                    onChange={(event) =>
                      setNotificationPreferences((previous) => ({
                        ...previous,
                        sendWindowEndHour: Number(event.target.value),
                      }))
                    }
                    className="h-10 rounded-md border border-gray-200 dark:border-border bg-white dark:bg-input px-3 text-sm dark:text-foreground"
                  >
                    {hourOptions
                      .map((hour) => hour + 1)
                      .filter((hour) => hour >= 1 && hour <= 24)
                      .map((hour) => (
                        <option key={`end-${hour}`} value={hour}>
                          Send window end: {formatHour(hour % 24)}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="mt-3">
                  <p className="text-xs text-gray-500 dark:text-muted-foreground mb-2">Reminder offsets</p>
                  <div className="flex flex-wrap gap-2">
                    {[7, 3, 1].map((offset) => {
                      const isActive = notificationPreferences.reminderOffsets.includes(offset)
                      return (
                        <button
                          key={offset}
                          type="button"
                          onClick={() => handleReminderToggle(offset)}
                          className={cn(
                            "px-3 py-1.5 rounded-md text-xs border",
                            isActive
                              ? "bg-sidebar-primary text-white border-sidebar-primary"
                              : "bg-white dark:bg-input text-gray-600 dark:text-foreground border-gray-200 dark:border-border",
                          )}
                        >
                          {offset} day{offset === 1 ? "" : "s"} before
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex justify-end mt-4">
                  <Button onClick={saveNotificationSettings} disabled={notificationSaving}>
                    {notificationSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Notification Preferences"
                    )}
                  </Button>
                </div>
              </div>

              <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-1">
                  <ReceiptText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="font-semibold text-gray-900 dark:text-foreground">Billing Settings</h3>
                </div>
                <p className="text-xs text-gray-500 dark:text-muted-foreground mb-4">Monitor plan lifecycle and transaction history.</p>

                {billingNotice && (
                  <div className={cn(
                    "mb-4 rounded-md border px-3 py-2 text-sm flex items-center gap-2",
                    billingNotice.kind === "success"
                      ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                      : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400",
                  )}>
                    {billingNotice.kind === "success" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <CircleAlert className="h-4 w-4" />
                    )}
                    {billingNotice.message}
                  </div>
                )}

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-md border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted p-3">
                    <p className="text-xs text-gray-500 dark:text-muted-foreground">Plan</p>
                    <p className="font-semibold text-gray-900 dark:text-foreground mt-0.5 uppercase">{subscription?.plan || "free"}</p>
                  </div>
                  <div className="rounded-md border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted p-3">
                    <p className="text-xs text-gray-500 dark:text-muted-foreground">Status</p>
                    <p className="font-semibold text-gray-900 dark:text-foreground mt-0.5 capitalize">{subscription?.status || "active"}</p>
                  </div>
                  <div className="rounded-md border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted p-3">
                    <p className="text-xs text-gray-500 dark:text-muted-foreground">Case Usage</p>
                    <p className="font-semibold text-gray-900 dark:text-foreground mt-0.5">
                      {subscription
                        ? subscription.caseLimit === null
                          ? `${subscription.casesUsed} / Unlimited`
                          : `${subscription.casesUsed} / ${subscription.caseLimit}`
                        : "—"}
                    </p>
                  </div>
                  <div className="rounded-md border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted p-3">
                    <p className="text-xs text-gray-500 dark:text-muted-foreground">Renewal</p>
                    <p className="font-semibold text-gray-900 dark:text-foreground mt-0.5">
                      {subscription?.renewalDate
                        ? new Date(subscription.renewalDate).toLocaleDateString("en-IN")
                        : subscription?.cancelAtPeriodEnd
                          ? "Cancels at period end"
                          : "Not scheduled"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-5">
                  <Button
                    variant="outline"
                    onClick={() => runSubscriptionAction("cancel")}
                    disabled={subscriptionLoading}
                  >
                    Cancel at Period End
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => runSubscriptionAction("renew")}
                    disabled={subscriptionLoading}
                  >
                    Renew
                  </Button>
                  <Button variant="outline" onClick={fetchSettingsData} disabled={subscriptionLoading}>
                    Refresh Billing Data
                  </Button>
                </div>

                <div className="rounded-lg border border-gray-200 dark:border-border overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-border flex items-center justify-between">
                    <p className="font-medium text-gray-900 dark:text-foreground">Recent Transactions</p>
                    <p className="text-xs text-gray-500 dark:text-muted-foreground">{transactions.length} shown</p>
                  </div>

                  {transactions.length === 0 ? (
                    <div className="p-6 text-sm text-gray-500 dark:text-muted-foreground text-center">No transactions available.</div>
                  ) : (
                    <div className="divide-y divide-gray-100 dark:divide-border">
                      {transactions.map((transaction) => (
                        <div key={transaction._id} className="p-4 text-sm space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-gray-900 dark:text-foreground">
                              {formatAmount(transaction.amount, transaction.currency || "INR")}
                            </p>
                            <span
                              className={cn(
                                "text-xs px-2 py-1 rounded-full border",
                                transaction.status === "completed"
                                  ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30"
                                  : transaction.status === "failed"
                                    ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30"
                                    : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30",
                              )}
                            >
                              {transaction.status}
                            </span>
                          </div>

                          <p className="text-xs text-gray-500 dark:text-muted-foreground">
                            {transaction.paymentGateway} • {formatDateValue(transaction.createdAt)}
                          </p>

                          {transaction.description ? (
                            <p className="text-xs text-gray-600 dark:text-gray-400">{transaction.description}</p>
                          ) : null}

                          {transaction.failureReason ? (
                            <p className="text-xs text-red-600 dark:text-red-400">Failure: {transaction.failureReason}</p>
                          ) : null}

                          <div className="flex items-center gap-3 text-xs">
                            {transaction.receiptUrl ? (
                              <a
                                href={transaction.receiptUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sidebar-primary underline"
                              >
                                Receipt
                              </a>
                            ) : null}
                            {transaction.invoiceUrl ? (
                              <a
                                href={transaction.invoiceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sidebar-primary underline"
                              >
                                Invoice
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}