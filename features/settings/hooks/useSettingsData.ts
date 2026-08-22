import { useCallback, useEffect, useState } from "react"
import type {
  AccountSettingsState,
  BillingTransaction,
  NoticeState,
  NotificationPreferencesState,
  SubscriptionState,
} from "../types"
import { defaultAccountState, defaultNotificationState } from "../utils"

export function useSettingsData(isSignedIn: boolean | undefined) {
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

  return {
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
  }
}
