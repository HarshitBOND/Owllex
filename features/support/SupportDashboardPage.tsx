"use client"

import { useEffect } from "react"
import { redirect, useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { Loader2, MessageSquare } from "lucide-react"
import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { useSupportAccess } from "./hooks/useSupportAccess"
import { useSupportMessages } from "./hooks/useSupportMessages"
import { useFraudReports } from "./hooks/useFraudReports"
import { useSuggestionModeration } from "./hooks/useSuggestionModeration"
import { useNotificationIssues } from "./hooks/useNotificationIssues"
import { useBillingIssues } from "./hooks/useBillingIssues"
import { AccessDenied } from "./components/AccessDenied"
import { SummaryCounts } from "./components/SummaryCounts"
import { SupportMessagesPanel } from "./components/SupportMessagesPanel"
import { FraudReportsPanel } from "./components/FraudReportsPanel"
import { SuggestionModerationPanel } from "./components/SuggestionModerationPanel"
import { NotificationIssuesPanel } from "./components/NotificationIssuesPanel"
import { BillingIssuesPanel } from "./components/BillingIssuesPanel"

export default function SupportDashboardPage() {
  const { isOpen } = useSidebar()
  const { isLoaded, isSignedIn } = useUser()
  const router = useRouter()

  const isSupport = useSupportAccess(isSignedIn)

  const messagesData = useSupportMessages(isSupport)
  const fraudData = useFraudReports(isSupport)
  const suggestionsData = useSuggestionModeration(isSupport)
  const notificationsData = useNotificationIssues(isSupport)
  const billingData = useBillingIssues(isSupport)

  useEffect(() => {
    if (isSupport) {
      messagesData.fetchMessages()
      fraudData.fetchFraudReports()
      suggestionsData.fetchSuggestions()
      notificationsData.fetchNotificationIssues()
      billingData.fetchBillingIssues()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isSupport,
    messagesData.fetchMessages,
    fraudData.fetchFraudReports,
    suggestionsData.fetchSuggestions,
    notificationsData.fetchNotificationIssues,
    billingData.fetchBillingIssues,
  ])

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F3F5F9]">
        <Loader2 className="h-8 w-8 animate-spin text-sidebar-primary" />
      </div>
    )
  }

  if (!isSignedIn) {
    return redirect("/")
  }

  if (isSupport === null) {
    return (
      <div className="flex">
        <Sidebar />
        <div className={cn("bg-[#F3F5F9] min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0", isOpen ? "lg:ml-48" : "lg:ml-12")}>
          <div className="bg-white border-b border-gray-200 w-full">
            <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
              <Navbar location="Support Panel" />
            </div>
          </div>
          <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-sidebar-primary" />
          </div>
        </div>
      </div>
    )
  }

  if (!isSupport) {
    return (
      <div className="flex">
        <Sidebar />
        <div className={cn("bg-[#F3F5F9] min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0", isOpen ? "lg:ml-48" : "lg:ml-12")}>
          <div className="bg-white border-b border-gray-200 w-full">
            <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
              <Navbar location="Support Panel" />
            </div>
          </div>
          <AccessDenied onBackToDashboard={() => router.push("/dashboard")} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className={cn("bg-[#F3F5F9] min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0", isOpen ? "lg:ml-48" : "lg:ml-12")}>
        <div className="bg-white border-b border-gray-200 w-full">
          <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
            <Navbar location="Support Panel" />
            <div className="flex items-center gap-2 mt-1">
              <MessageSquare className="h-5 w-5 text-sidebar-primary" />
              <p className="text-sm text-gray-600">Review user submissions, fraud reports, and operational issues</p>
            </div>
          </div>
        </div>

        <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-6 space-y-5">
          <SummaryCounts
            newMessages={messagesData.counts.new}
            newFraud={fraudData.fraudCounts.new}
            openNotificationIssues={notificationsData.notificationIssueCounts.open}
            openBillingIssues={billingData.billingIssueCounts.open}
            pendingSuggestions={suggestionsData.suggestionCounts.pending}
          />

          <SupportMessagesPanel
            messages={messagesData.messages}
            counts={messagesData.counts}
            statusFilter={messagesData.statusFilter}
            setStatusFilter={messagesData.setStatusFilter}
            search={messagesData.search}
            setSearch={messagesData.setSearch}
            page={messagesData.page}
            setPage={messagesData.setPage}
            totalPages={messagesData.totalPages}
            loading={messagesData.loading}
            updatingId={messagesData.updatingId}
            onSearch={messagesData.fetchMessages}
            onUpdateStatus={messagesData.updateStatus}
          />

          <FraudReportsPanel
            fraudReports={fraudData.fraudReports}
            fraudStatusFilter={fraudData.fraudStatusFilter}
            setFraudStatusFilter={fraudData.setFraudStatusFilter}
            fraudSearch={fraudData.fraudSearch}
            setFraudSearch={fraudData.setFraudSearch}
            fraudLoading={fraudData.fraudLoading}
            fraudUpdatingId={fraudData.fraudUpdatingId}
            fraudNotesById={fraudData.fraudNotesById}
            setFraudNotesById={fraudData.setFraudNotesById}
            onRefresh={fraudData.fetchFraudReports}
            onUpdateStatus={fraudData.updateFraudStatus}
          />

          <SuggestionModerationPanel
            suggestions={suggestionsData.suggestions}
            suggestionStatusFilter={suggestionsData.suggestionStatusFilter}
            setSuggestionStatusFilter={suggestionsData.setSuggestionStatusFilter}
            suggestionSearch={suggestionsData.suggestionSearch}
            setSuggestionSearch={suggestionsData.setSuggestionSearch}
            suggestionLoading={suggestionsData.suggestionLoading}
            suggestionUpdatingId={suggestionsData.suggestionUpdatingId}
            suggestionNotesById={suggestionsData.suggestionNotesById}
            setSuggestionNotesById={suggestionsData.setSuggestionNotesById}
            onRefresh={suggestionsData.fetchSuggestions}
            onUpdateStatus={suggestionsData.updateSuggestionStatus}
          />

          <NotificationIssuesPanel
            notificationIssues={notificationsData.notificationIssues}
            notificationIssueFilter={notificationsData.notificationIssueFilter}
            setNotificationIssueFilter={notificationsData.setNotificationIssueFilter}
            notificationSearch={notificationsData.notificationSearch}
            setNotificationSearch={notificationsData.setNotificationSearch}
            notificationLoading={notificationsData.notificationLoading}
            notificationUpdatingId={notificationsData.notificationUpdatingId}
            notificationNotesById={notificationsData.notificationNotesById}
            setNotificationNotesById={notificationsData.setNotificationNotesById}
            onRefresh={notificationsData.fetchNotificationIssues}
            onRetry={notificationsData.retryNotificationIssue}
            onUpdateStatus={notificationsData.updateNotificationIssueStatus}
          />

          <BillingIssuesPanel
            billingIssues={billingData.billingIssues}
            billingIssueFilter={billingData.billingIssueFilter}
            setBillingIssueFilter={billingData.setBillingIssueFilter}
            billingSearch={billingData.billingSearch}
            setBillingSearch={billingData.setBillingSearch}
            billingLoading={billingData.billingLoading}
            billingUpdatingId={billingData.billingUpdatingId}
            billingNotesById={billingData.billingNotesById}
            setBillingNotesById={billingData.setBillingNotesById}
            onRefresh={billingData.fetchBillingIssues}
            onUpdateStatus={billingData.updateBillingIssueStatus}
          />
        </div>
      </div>
    </div>
  )
}
