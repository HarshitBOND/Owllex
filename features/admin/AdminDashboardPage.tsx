"use client"

import { useEffect, useState } from "react"
import { useUser } from "@clerk/nextjs"
import { RefreshCw } from "lucide-react"
import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { Tab } from "./types"
import { useAdminAccess } from "./hooks/useAdminAccess"
import { useDashboardData } from "./hooks/useDashboardData"
import { useUsersData } from "./hooks/useUsersData"
import { useTransactionsData } from "./hooks/useTransactionsData"
import { useDocumentsData } from "./hooks/useDocumentsData"
import { useDocumentTemplatesData } from "./hooks/useDocumentTemplatesData"
import { useLogsData } from "./hooks/useLogsData"
import { useCauselistImport } from "./hooks/useCauselistImport"
import { useRagIngestData } from "./hooks/useRagIngestData"
import { useSciScraperData } from "./hooks/useSciScraperData"
import { AdminTabNav } from "./components/AdminTabNav"
import { DashboardTab } from "./components/DashboardTab"
import { UsersTab } from "./components/UsersTab"
import { TransactionsTab } from "./components/TransactionsTab"
import { DocumentsTab } from "./components/DocumentsTab"
import { DocumentTemplatesTab } from "./components/DocumentTemplatesTab"
import { AiUsageTab } from "./components/AiUsageTab"
import { LogsTab } from "./components/LogsTab"
import { CauseListTab } from "./components/CauseListTab"
import { RagIngestTab } from "./components/RagIngestTab"
import { SciScraperTab } from "./components/SciScraperTab"

export default function AdminDashboardPage() {
  const { isOpen } = useSidebar()
  const { isLoaded, isSignedIn } = useUser()

  const [activeTab, setActiveTab] = useState<Tab>("dashboard")
  const isAdmin = useAdminAccess(isSignedIn)

  const dashboard = useDashboardData()
  const usersData = useUsersData()
  const transactionsData = useTransactionsData()
  const documentsData = useDocumentsData()
  const templatesData = useDocumentTemplatesData()
  const logsData = useLogsData()
  const causelist = useCauselistImport()
  const ragIngest = useRagIngestData()
  const sciScraper = useSciScraperData(ragIngest.fetchRagStatus)

  const refreshActiveTab = () => {
    if (activeTab === "dashboard") dashboard.fetchDashboard()
    else if (activeTab === "users") usersData.fetchUsers()
    else if (activeTab === "transactions") transactionsData.fetchTransactions()
    else if (activeTab === "documents") documentsData.fetchDocuments()
    else if (activeTab === "templates") templatesData.fetchTemplates()
    else if (activeTab === "logs") logsData.fetchLogs()
    else if (activeTab === "causelist") causelist.fetchCauselistStatus()
    else if (activeTab === "rag") ragIngest.fetchRagStatus()
    else if (activeTab === "sci-scraper") {
      sciScraper.fetchSciScraperStatus()
      ragIngest.fetchRagStatus()
    }
  }

  useEffect(() => {
    if (isAdmin !== true) return
    refreshActiveTab()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTab,
    isAdmin,
    dashboard.fetchDashboard,
    usersData.fetchUsers,
    transactionsData.fetchTransactions,
    documentsData.fetchDocuments,
    templatesData.fetchTemplates,
    logsData.fetchLogs,
    causelist.fetchCauselistStatus,
  ])

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F3F5F9] dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isSignedIn) {
    if (typeof window !== "undefined") window.location.href = "/"
    return null
  }

  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F3F5F9] dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Verifying admin access...</p>
        </div>
      </div>
    )
  }

  if (isAdmin === false) {
    if (typeof window !== "undefined") window.location.href = "/"
    return null
  }

  return (
    <div className="flex">
      <Sidebar />
      <div
        className={cn(
          "bg-[#F3F5F9] dark:bg-gray-950 flex flex-col items-start min-h-screen h-fit w-full transition-all duration-300 pb-20 lg:pb-0",
          "lg:ml-[var(--sidebar-offset)]"
        )}
      >
        <div className="w-full">
          <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 w-full">
            <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
              <Navbar location="Admin Panel" />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                    Admin Panel
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Manage users, transactions, documents, and system logs
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={refreshActiveTab} className="gap-1.5">
                  <RefreshCw size={14} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>

          <AdminTabNav activeTab={activeTab} onSelect={setActiveTab} />

          <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-6">
            {activeTab === "dashboard" && (
              <DashboardTab
                loading={dashboard.loading}
                stats={dashboard.stats}
                recentUsers={dashboard.recentUsers}
                recentTransactions={dashboard.recentTransactions}
                onNavigateTab={setActiveTab}
              />
            )}
            {activeTab === "users" && (
              <UsersTab
                users={usersData.users}
                usersTotal={usersData.usersTotal}
                usersPage={usersData.usersPage}
                usersTotalPages={usersData.usersTotalPages}
                usersSearch={usersData.usersSearch}
                setUsersSearch={usersData.setUsersSearch}
                usersRoleFilter={usersData.usersRoleFilter}
                setUsersRoleFilter={usersData.setUsersRoleFilter}
                usersBannedFilter={usersData.usersBannedFilter}
                setUsersBannedFilter={usersData.setUsersBannedFilter}
                banningId={usersData.banningId}
                changingPlanId={usersData.changingPlanId}
                onSearch={usersData.fetchUsers}
                onBanToggle={usersData.handleBanToggle}
                onPlanChange={usersData.handlePlanChange}
              />
            )}
            {activeTab === "transactions" && (
              <TransactionsTab
                transactions={transactionsData.transactions}
                txTotal={transactionsData.txTotal}
                txPage={transactionsData.txPage}
                txTotalPages={transactionsData.txTotalPages}
                txStatusFilter={transactionsData.txStatusFilter}
                setTxStatusFilter={transactionsData.setTxStatusFilter}
                txDateFrom={transactionsData.txDateFrom}
                setTxDateFrom={transactionsData.setTxDateFrom}
                txDateTo={transactionsData.txDateTo}
                setTxDateTo={transactionsData.setTxDateTo}
                onSearch={transactionsData.fetchTransactions}
              />
            )}
            {activeTab === "documents" && (
              <DocumentsTab
                documents={documentsData.documents}
                docsTotal={documentsData.docsTotal}
                docsPage={documentsData.docsPage}
                docsTotalPages={documentsData.docsTotalPages}
                docsSearch={documentsData.docsSearch}
                setDocsSearch={documentsData.setDocsSearch}
                docsTypeFilter={documentsData.docsTypeFilter}
                setDocsTypeFilter={documentsData.setDocsTypeFilter}
                onSearch={documentsData.fetchDocuments}
              />
            )}
            {activeTab === "templates" && <DocumentTemplatesTab data={templatesData} />}
            {activeTab === "ai-usage" && <AiUsageTab />}
            {activeTab === "logs" && (
              <LogsTab
                logs={logsData.logs}
                logsTotal={logsData.logsTotal}
                logsPage={logsData.logsPage}
                logsTotalPages={logsData.logsTotalPages}
                logsActionFilter={logsData.logsActionFilter}
                setLogsActionFilter={logsData.setLogsActionFilter}
                onSearch={logsData.fetchLogs}
              />
            )}
            {activeTab === "causelist" && (
              <CauseListTab
                clStatus={causelist.clStatus}
                clRunning={causelist.clRunning}
                clProgress={causelist.clProgress}
                clSummary={causelist.clSummary}
                clAutoDelete={causelist.clAutoDelete}
                setClAutoDelete={causelist.setClAutoDelete}
                clDaysBack={causelist.clDaysBack}
                setClDaysBack={causelist.setClDaysBack}
                clFromCheckpoint={causelist.clFromCheckpoint}
                setClFromCheckpoint={causelist.setClFromCheckpoint}
                clBackendError={causelist.clBackendError}
                onRetryConnection={() => {
                  causelist.setClBackendError(null)
                  causelist.fetchCauselistStatus()
                }}
                onStartImport={causelist.handleStartCauselistImport}
              />
            )}
            {activeTab === "rag" && (
              <RagIngestTab
                queue={ragIngest.queue}
                addFiles={ragIngest.addFiles}
                removeItem={ragIngest.removeItem}
                clearFinished={ragIngest.clearFinished}
                groupItems={ragIngest.groupItems}
                reorderGroupPage={ragIngest.reorderGroupPage}
                ungroupItem={ragIngest.ungroupItem}
                uploadItem={ragIngest.uploadItem}
                uploadAll={ragIngest.uploadAll}
                status={ragIngest.status}
                statusError={ragIngest.statusError}
                statusLoading={ragIngest.statusLoading}
                fetchRagStatus={ragIngest.fetchRagStatus}
                searchQuery={ragIngest.searchQuery}
                setSearchQuery={ragIngest.setSearchQuery}
                searchResults={ragIngest.searchResults}
                searchError={ragIngest.searchError}
                searching={ragIngest.searching}
                runSearch={ragIngest.runSearch}
              />
            )}
            {activeTab === "sci-scraper" && (
              <SciScraperTab
                count={sciScraper.count}
                setCount={sciScraper.setCount}
                job={sciScraper.job}
                running={sciScraper.running}
                starting={sciScraper.starting}
                formError={sciScraper.formError}
                onStart={sciScraper.handleStartSciScraper}
                onCancel={sciScraper.handleCancelSciScraper}
                kbStatus={ragIngest.status}
                kbStatusLoading={ragIngest.statusLoading}
                kbStatusError={ragIngest.statusError}
                onRefreshKb={ragIngest.fetchRagStatus}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
