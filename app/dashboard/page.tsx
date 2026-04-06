"use client"

import { Suspense, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
const Calendar = dynamic(() => import("@/components/lexvert-calendar").then(mod => ({ default: mod.Calendar })), { ssr: false })
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import {
  FileSearch, FileText, Calendar as CalendarIcon,
  Users, Briefcase, CheckSquare, Clock, ArrowRight,
  TrendingUp, LoaderCircle, BarChart3, Plus, Activity, AlertTriangle,
  ChevronDown
} from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useUser } from "@clerk/nextjs"

// Mobile Dashboard Section tabs
type MobileSection = "overview" | "calendar" | "tasks" | "activity"

interface DashboardData {
  stats: {
    totalCases: number
    totalClients: number
    pendingTasks: number
    completedTasks: number
    upcomingHearings: number
  }
  recentCases: any[]
  recentClients: any[]
  recentTasks: any[]
  upcomingHearings: any[]
  subscription: {
    plan: string
    status: string
    billingCycle: string
    caseLimit: number | null
    casesUsed: number
    casesRemaining: number | null
    isPaidPlan: boolean
    features: {
      parserUpload: boolean
      advancedAutomation: boolean
      prioritySupport: boolean
    }
    renewalDate: string | null
    cancelAtPeriodEnd: boolean
  } | null
  analytics: {
    overdueTasks: number
    tasksDueNext7Days: number
    hearingsNext30Days: number
    outstandingInvoices: number
    overdueInvoices: number
    recentFailedTransactions: number
  }
  billing: {
    totalOutstanding: number
    overdueOutstanding: number
    collectedThisMonth: number
    openBillingIssues: number
    recentTransactions: any[]
  }
  activityFeed: any[]
  operations: {
    automationEnabled: boolean
    recentJobs: any[]
  }
}

const Dashboard = () => {
  const { isOpen } = useSidebar()
  const router = useRouter()
  const { isLoaded, isSignedIn, user } = useUser()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [mobileSection, setMobileSection] = useState<MobileSection>("overview")
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({
    hearings: true,
    stats: true,
  })

  useEffect(() => {
    if (isSignedIn) {
      fetch("/api/userdetails/dashboard")
        .then(res => res.json())
        .then(d => { setData(d); setLoading(false) })
        .catch(() => setLoading(false))
    }
  }, [isSignedIn])

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/")
    }
  }, [isLoaded, isSignedIn, router])

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading your workspace...</p>
        </div>
      </div>
    )
  }
  if (!isSignedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-sm text-muted-foreground">Redirecting...</div>
      </div>
    )
  }

  const stats = data?.stats || { totalCases: 0, totalClients: 0, pendingTasks: 0, completedTasks: 0, upcomingHearings: 0 }
  const subscription = data?.subscription || {
    plan: "free",
    status: "active",
    billingCycle: "monthly",
    caseLimit: 10,
    casesUsed: stats.totalCases,
    casesRemaining: Math.max(10 - stats.totalCases, 0),
    isPaidPlan: false,
    features: {
      parserUpload: false,
      advancedAutomation: false,
      prioritySupport: false,
    },
    renewalDate: null,
    cancelAtPeriodEnd: false,
  }

  const analytics = data?.analytics || {
    overdueTasks: 0,
    tasksDueNext7Days: 0,
    hearingsNext30Days: 0,
    outstandingInvoices: 0,
    overdueInvoices: 0,
    recentFailedTransactions: 0,
  }

  const billing = data?.billing || {
    totalOutstanding: 0,
    overdueOutstanding: 0,
    collectedThisMonth: 0,
    openBillingIssues: 0,
    recentTransactions: [],
  }

  const activityFeed = data?.activityFeed || []
  const operations = data?.operations || {
    automationEnabled: false,
    recentJobs: [],
  }

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Number.isFinite(value) ? value : 0)

  const statCards = [
    {
      name: "Active Cases",
      value: stats.totalCases,
      icon: Briefcase,
      color: "text-blue-600 dark:text-sky-400",
      bgColor: "bg-blue-50 dark:bg-sky-500/10",
      borderColor: "border-blue-200 dark:border-sky-500/30",
      description: "Total cases in your portfolio"
    },
    {
      name: "Total Clients",
      value: stats.totalClients,
      icon: Users,
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-50 dark:bg-emerald-500/10",
      borderColor: "border-emerald-200 dark:border-emerald-500/30",
      description: "Clients under management"
    },
    {
      name: "Pending Tasks",
      value: stats.pendingTasks,
      icon: CheckSquare,
      color: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-50 dark:bg-orange-500/10",
      borderColor: "border-orange-200 dark:border-orange-500/30",
      description: "Tasks awaiting completion"
    },
    {
      name: "Upcoming Hearings",
      value: stats.upcomingHearings,
      icon: Clock,
      color: "text-violet-600 dark:text-violet-400",
      bgColor: "bg-violet-50 dark:bg-violet-500/10",
      borderColor: "border-violet-200 dark:border-violet-500/30",
      description: "Hearings on schedule"
    },
  ]

  const quickActions = [
    {
      name: "My Cases",
      description: "Track and manage all your cases",
      icon: <FileSearch className="text-white" size={20} />,
      href: "/case-tracking",
      color: "bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
    },
    {
      name: "Add Client",
      description: "Register a new client",
      icon: <Users className="text-white" size={20} />,
      href: "/my-clients/add",
      color: "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
    },
    {
      name: "New Affidavit",
      description: "Generate affidavit with AI assistance",
      icon: <FileText className="text-white" size={20} />,
      href: "/generate-affidavit",
      color: "bg-teal-600 hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500"
    },
    {
      name: "View Invoices",
      description: "Billing and payment tracking",
      icon: <BarChart3 className="text-white" size={20} />,
      href: "/invoices",
      color: "bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500"
    },
  ]

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good Morning"
    if (hour < 17) return "Good Afternoon"
    return "Good Evening"
  }

  const toggleCard = (cardId: string) => {
    setExpandedCards(prev => ({ ...prev, [cardId]: !prev[cardId] }))
  }

  const mobileSectionTabs = [
    { id: "overview" as MobileSection, label: "Overview", icon: Briefcase },
    { id: "calendar" as MobileSection, label: "Calendar", icon: CalendarIcon },
    { id: "tasks" as MobileSection, label: "Tasks", icon: CheckSquare },
    { id: "activity" as MobileSection, label: "Activity", icon: Activity },
  ]

  return (
    <div className="flex">
      <Sidebar />
      <div className={cn("bg-[#F3F5F9] dark:bg-background flex flex-col items-start min-h-screen h-fit w-full transition-all duration-300 pb-20 lg:pb-0", isOpen ? "lg:ml-48" : "lg:ml-12")}>
        <div className="w-full">
          {/* Header Section */}
          <div className="bg-white dark:bg-card border-b border-gray-200 dark:border-border w-full">
            <div className="max-w-[1400px] w-full mx-auto px-3 sm:px-4 md:px-6 py-3 md:py-4">
              <Navbar location="Dashboard" />
              <div className="mb-2">
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-foreground">
                  {getGreeting()}, {user?.firstName || "Counselor"} 👋
                </h2>
                <p className="text-xs sm:text-sm md:text-base text-muted-foreground mt-1">
                  Here&apos;s an overview of your legal workspace
                </p>
              </div>

              {/* Mobile Section Tabs - Only visible on mobile */}
              <div className="flex gap-1 mt-3 overflow-x-auto pb-1 lg:hidden scrollbar-hide">
                {mobileSectionTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setMobileSection(tab.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                      mobileSection === tab.id
                        ? "bg-sidebar-primary text-white"
                        : "bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground hover:bg-gray-200 dark:hover:bg-muted/80"
                    )}
                  >
                    <tab.icon size={14} />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="max-w-[1400px] w-full mx-auto px-3 sm:px-4 md:px-6 py-4 md:py-6">
            
            {/* ===== MOBILE OVERVIEW SECTION ===== */}
            <div className={cn("lg:hidden", mobileSection !== "overview" && "hidden")}>
              {/* Mobile Stats Cards - Compact 2x2 grid */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                {statCards.map((item) => (
                  <div
                    key={item.name}
                    className={cn(
                      "bg-white dark:bg-card rounded-lg border p-3 shadow-sm",
                      item.borderColor
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn("p-1.5 rounded-md", item.bgColor)}>
                        <item.icon className={cn("h-4 w-4", item.color)} />
                      </div>
                      <p className="text-lg font-bold text-gray-900 dark:text-foreground">
                        {loading ? "—" : item.value}
                      </p>
                    </div>
                    <p className="text-xs font-medium text-gray-600 dark:text-muted-foreground">{item.name}</p>
                  </div>
                ))}
              </div>

              {/* Mobile Upcoming Hearings - Collapsible */}
              <div className="bg-white dark:bg-card rounded-lg border border-violet-200 dark:border-violet-500/30 shadow-sm mb-4">
                <button
                  onClick={() => toggleCard('hearings')}
                  className="w-full p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-violet-100 dark:bg-violet-500/10 rounded-md">
                      <Clock className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-foreground">Upcoming Hearings</h3>
                      <p className="text-xs text-gray-500 dark:text-muted-foreground">{stats.upcomingHearings} scheduled</p>
                    </div>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-gray-400 dark:text-muted-foreground transition-transform", expandedCards.hearings && "rotate-180")} />
                </button>
                {expandedCards.hearings && (
                  <div className="px-3 pb-3 space-y-2">
                    {loading ? (
                      <div className="flex items-center justify-center py-4">
                        <LoaderCircle className="animate-spin text-gray-400 dark:text-muted-foreground" size={20} />
                      </div>
                    ) : data?.upcomingHearings && data.upcomingHearings.length > 0 ? (
                      data.upcomingHearings.slice(0, 3).map((hearing: any, i: number) => (
                        <div key={hearing._id || i} className="flex items-center gap-2 p-2 rounded-md bg-violet-50/50 dark:bg-violet-500/5 border border-violet-100 dark:border-violet-500/20" onClick={() => hearing._id && router.push(`/case-tracking/view/${hearing._id}`)}>
                          <div className="flex flex-col items-center bg-violet-100 dark:bg-violet-500/20 rounded px-2 py-1 min-w-[40px]">
                            <span className="text-[10px] font-medium text-violet-600 dark:text-violet-400">
                              {hearing.courtDate ? new Date(hearing.courtDate).toLocaleDateString('en-US', { month: 'short' }) : '—'}
                            </span>
                            <span className="text-sm font-bold text-violet-700 dark:text-violet-300">
                              {hearing.courtDate ? new Date(hearing.courtDate).getDate() : '—'}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 dark:text-foreground truncate">{hearing.caseTitle || hearing.caseNo}</p>
                            <p className="text-[10px] text-gray-500 dark:text-muted-foreground truncate">{hearing.courtName || 'Court not specified'}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-muted-foreground text-center py-2">No upcoming hearings</p>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => router.push("/case-tracking")} className="w-full text-xs h-8">
                      View All Cases <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Mobile Quick Actions */}
              <div className="bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border shadow-sm mb-4">
                <div className="p-3 border-b border-gray-100 dark:border-border">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-foreground">Quick Actions</h3>
                </div>
                <div className="p-2 grid grid-cols-2 gap-2">
                  {quickActions.slice(0, 4).map((item) => (
                    <button
                      key={item.name}
                      onClick={() => router.push(item.href)}
                      className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-100 dark:border-border hover:bg-gray-50 dark:hover:bg-muted text-left"
                    >
                      <span className={cn("p-1.5 rounded-md flex-shrink-0", item.color)}>
                        {item.icon}
                      </span>
                      <span className="text-xs font-medium text-gray-900 dark:text-foreground truncate">{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Mobile Analytics Summary */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-white dark:bg-card rounded-lg border border-amber-200 dark:border-amber-500/30 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-lg font-bold text-gray-900 dark:text-foreground">{analytics.overdueTasks}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-muted-foreground">Overdue Tasks</p>
                </div>
                <div className="bg-white dark:bg-card rounded-lg border border-blue-200 dark:border-sky-500/30 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <BarChart3 className="h-4 w-4 text-blue-600 dark:text-sky-400" />
                    <span className="text-sm font-bold text-gray-900 dark:text-foreground">{formatMoney(billing.totalOutstanding)}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-muted-foreground">Outstanding</p>
                </div>
              </div>
            </div>

            {/* ===== MOBILE CALENDAR SECTION ===== */}
            <div className={cn("lg:hidden", mobileSection !== "calendar" && "hidden")}>
              <div className="bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border shadow-sm">
                <div className="p-3 border-b border-gray-100 dark:border-border">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-foreground flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-sidebar-primary" />
                    Your Calendar
                  </h3>
                </div>
                <div className="p-2">
                  <Suspense fallback={
                    <div className="flex items-center justify-center h-64">
                      <LoaderCircle className="animate-spin text-sidebar-primary" size={24} />
                    </div>
                  }>
                    <Calendar embedded />
                  </Suspense>
                </div>
              </div>
            </div>

            {/* ===== MOBILE TASKS SECTION ===== */}
            <div className={cn("lg:hidden", mobileSection !== "tasks" && "hidden")}>
              <div className="bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border shadow-sm mb-4">
                <div className="p-3 border-b border-gray-100 dark:border-border flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-foreground flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    Pending Tasks
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => router.push("/tasks")} className="text-xs h-7 px-2">
                    View All
                  </Button>
                </div>
                <div className="p-3 space-y-2">
                  {loading ? (
                    <div className="flex items-center justify-center py-6">
                      <LoaderCircle className="animate-spin text-gray-400 dark:text-muted-foreground" size={20} />
                    </div>
                  ) : data?.recentTasks && data.recentTasks.length > 0 ? (
                    data.recentTasks.slice(0, 6).map((task: any, i: number) => (
                      <div key={task._id || i} className="flex items-center gap-2 p-2 rounded-md bg-gray-50 dark:bg-muted">
                        <div className={cn(
                          "w-2 h-2 rounded-full flex-shrink-0",
                          task.dueDate && new Date(task.dueDate) < new Date() ? "bg-red-500" : "bg-orange-400"
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 dark:text-foreground truncate">{task.task}</p>
                          <p className="text-[10px] text-gray-500 dark:text-muted-foreground">
                            Due: {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date'}
                          </p>
                        </div>
                        {task.dueDate && new Date(task.dueDate) < new Date() && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-medium">Overdue</span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-xs text-gray-500 dark:text-muted-foreground">No pending tasks</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Task Stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white dark:bg-card rounded-lg border dark:border-border p-3">
                  <p className="text-xs text-gray-500 dark:text-muted-foreground">Tasks Due (7 days)</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-foreground">{analytics.tasksDueNext7Days}</p>
                </div>
                <div className="bg-white dark:bg-card rounded-lg border border-red-200 dark:border-red-500/30 p-3">
                  <p className="text-xs text-gray-500 dark:text-muted-foreground">Overdue</p>
                  <p className="text-xl font-bold text-red-600 dark:text-red-400">{analytics.overdueTasks}</p>
                </div>
              </div>
            </div>

            {/* ===== MOBILE ACTIVITY SECTION ===== */}
            <div className={cn("lg:hidden", mobileSection !== "activity" && "hidden")}>
              <div className="bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border shadow-sm mb-4">
                <div className="p-3 border-b border-gray-100 dark:border-border">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-foreground">Recent Activity</h3>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-border">
                  {activityFeed.length > 0 ? (
                    activityFeed.slice(0, 8).map((item: any, index: number) => (
                      <div
                        key={`${item.type}-${index}`}
                        className="p-3 hover:bg-gray-50 dark:hover:bg-muted"
                        onClick={() => item.href && router.push(item.href)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-900 dark:text-foreground truncate">{item.title}</p>
                            <p className="text-[10px] text-gray-500 dark:text-muted-foreground truncate">{item.subtitle}</p>
                          </div>
                          <span className="text-[10px] text-gray-400 dark:text-muted-foreground whitespace-nowrap">
                            {item.at ? new Date(item.at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-xs text-gray-500 dark:text-muted-foreground text-center">No recent activity</div>
                  )}
                </div>
              </div>

              {/* Recent Cases & Clients */}
              <div className="space-y-4">
                {data?.recentCases && data.recentCases.length > 0 && (
                  <div className="bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border shadow-sm">
                    <div className="p-3 border-b border-gray-100 dark:border-border flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-foreground flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-blue-600 dark:text-sky-400" />
                        Recent Cases
                      </h3>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-border">
                      {data.recentCases.slice(0, 3).map((c: any, i: number) => (
                        <div key={c._id || i} className="p-3" onClick={() => router.push(`/case-tracking/view/${c._id}`)}>
                          <p className="text-xs font-medium text-gray-900 dark:text-foreground truncate">{c.caseTitle || c.caseNo}</p>
                          <p className="text-[10px] text-gray-500 dark:text-muted-foreground">{c.courtName || 'N/A'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {data?.recentClients && data.recentClients.length > 0 && (
                  <div className="bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border shadow-sm">
                    <div className="p-3 border-b border-gray-100 dark:border-border">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-foreground flex items-center gap-2">
                        <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        Recent Clients
                      </h3>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-border">
                      {data.recentClients.slice(0, 3).map((client: any, i: number) => (
                        <div key={client._id || i} className="p-3 flex items-center gap-2" onClick={() => router.push(`/my-clients/view/${client._id}`)}>
                          <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                              {(client.name || 'U')[0].toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-900 dark:text-foreground truncate">{client.name}</p>
                            <p className="text-[10px] text-gray-500 dark:text-muted-foreground truncate">{client.email || client.contact || 'No contact'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ===== DESKTOP LAYOUT ===== */}
            <div className="hidden lg:block">
            {/* Upcoming Hearings - Primary Focus at Top */}
            <div className="bg-white dark:bg-card rounded-xl border border-violet-200 dark:border-violet-500/30 shadow-sm mb-6">
              <div className="p-4 border-b border-gray-100 dark:border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-violet-100 dark:bg-violet-500/10 rounded-lg">
                    <Clock className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground">Upcoming Hearings</h3>
                    <p className="text-sm text-muted-foreground">Your next scheduled court dates</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => router.push("/case-tracking/add")} className="text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-500/30 hover:bg-violet-50 dark:hover:bg-violet-500/10">
                    <Plus className="h-3 w-3 mr-1" />
                    Add Case
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => router.push("/case-tracking")} className="text-sidebar-primary hover:text-sidebar-primary/80">
                    View All <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
              <div className="p-4">
                {loading ? (
                  <div className="flex items-center justify-center py-6">
                    <LoaderCircle className="animate-spin text-gray-400 dark:text-muted-foreground" size={24} />
                  </div>
                ) : data?.upcomingHearings && data.upcomingHearings.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                    {data.upcomingHearings.slice(0, 5).map((hearing: any, i: number) => (
                      <div key={hearing._id || i} className="flex items-start gap-3 p-3 rounded-lg bg-violet-50/50 dark:bg-violet-500/5 border border-violet-100 dark:border-violet-500/20 hover:border-violet-200 dark:hover:border-violet-500/40 hover:shadow-sm transition-all cursor-pointer" onClick={() => hearing._id && router.push(`/case-tracking/view/${hearing._id}`)}>
                        <div className="flex flex-col items-center justify-center bg-violet-100 dark:bg-violet-500/20 rounded-lg px-3 py-2 min-w-[52px]">
                          <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
                            {hearing.courtDate ? new Date(hearing.courtDate).toLocaleDateString('en-US', { month: 'short' }) : '—'}
                          </span>
                          <span className="text-lg font-bold text-violet-700 dark:text-violet-300">
                            {hearing.courtDate ? new Date(hearing.courtDate).getDate() : '—'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-gray-900 dark:text-foreground truncate">{hearing.caseTitle || hearing.caseNo}</p>
                          <p className="text-xs text-gray-500 dark:text-muted-foreground mt-0.5">{hearing.courtName || 'Court not specified'}</p>
                          <p className="text-xs text-gray-400 dark:text-muted-foreground mt-0.5">Case No: {hearing.caseNo}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <CalendarIcon className="h-10 w-10 text-gray-300 dark:text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-600 dark:text-muted-foreground">No upcoming hearings</p>
                    <p className="text-xs text-gray-400 dark:text-muted-foreground mt-1">Add cases to see hearing dates here</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-500/30 hover:bg-violet-50 dark:hover:bg-violet-500/10"
                      onClick={() => router.push("/case-tracking/add")}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Your First Case
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
              {statCards.map((item) => (
                <div
                  key={item.name}
                  className={cn(
                    "bg-white dark:bg-card rounded-xl border p-4 md:p-5 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer group",
                    item.borderColor
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn("p-2 rounded-lg", item.bgColor)}>
                      <item.icon className={cn("h-5 w-5", item.color)} />
                    </div>
                    {loading ? (
                      <div className="w-6 h-6 border-2 border-t-transparent border-gray-300 dark:border-gray-600 rounded-full animate-spin" />
                    ) : (
                      <TrendingUp className="h-4 w-4 text-gray-400 dark:text-muted-foreground group-hover:text-gray-600 dark:group-hover:text-foreground transition-colors" />
                    )}
                  </div>
                  <p className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-foreground">
                    {loading ? "—" : item.value}
                  </p>
                  <p className="text-sm font-medium text-gray-700 dark:text-foreground mt-1">{item.name}</p>
                  <p className="text-xs text-gray-500 dark:text-muted-foreground hidden md:block">{item.description}</p>
                </div>
              ))}
            </div>

            <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-border shadow-sm mb-6">
              <div className="p-4 border-b border-gray-100 dark:border-border flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground">Plan & Billing Status</h3>
                  <p className="text-sm text-muted-foreground">Current plan limits and access</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 dark:text-muted-foreground uppercase tracking-wide">Plan</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-foreground">{subscription.plan.toUpperCase()}</p>
                </div>
              </div>
              <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <div className="p-3 rounded-lg border dark:border-border bg-gray-50 dark:bg-muted">
                  <p className="text-xs text-gray-500 dark:text-muted-foreground">Status</p>
                  <p className="font-semibold text-gray-900 dark:text-foreground capitalize">{subscription.status}</p>
                </div>
                <div className="p-3 rounded-lg border dark:border-border bg-gray-50 dark:bg-muted">
                  <p className="text-xs text-gray-500 dark:text-muted-foreground">Case Usage</p>
                  <p className="font-semibold text-gray-900 dark:text-foreground">
                    {subscription.caseLimit === null
                      ? `${subscription.casesUsed} / Unlimited`
                      : `${subscription.casesUsed} / ${subscription.caseLimit}`}
                  </p>
                </div>
                <div className="p-3 rounded-lg border dark:border-border bg-gray-50 dark:bg-muted">
                  <p className="text-xs text-gray-500 dark:text-muted-foreground">Parser Access</p>
                  <p className="font-semibold text-gray-900 dark:text-foreground">
                    {subscription.features.parserUpload ? "Included" : "Paid plans only"}
                  </p>
                </div>
                <div className="p-3 rounded-lg border dark:border-border bg-gray-50 dark:bg-muted">
                  <p className="text-xs text-gray-500 dark:text-muted-foreground">Renewal</p>
                  <p className="font-semibold text-gray-900 dark:text-foreground">
                    {subscription.renewalDate
                      ? new Date(subscription.renewalDate).toLocaleDateString("en-IN")
                      : subscription.cancelAtPeriodEnd
                        ? "Cancels at period end"
                        : "Not scheduled"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
              <div className="bg-white dark:bg-card rounded-xl border border-amber-200 dark:border-amber-500/30 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 dark:text-muted-foreground">Overdue Tasks</p>
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-foreground mt-2">{analytics.overdueTasks}</p>
                <p className="text-xs text-gray-500 dark:text-muted-foreground mt-1">Pending work past due date</p>
              </div>

              <div className="bg-white dark:bg-card rounded-xl border border-violet-200 dark:border-violet-500/30 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 dark:text-muted-foreground">Hearings (30d)</p>
                  <Clock className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-foreground mt-2">{analytics.hearingsNext30Days}</p>
                <p className="text-xs text-gray-500 dark:text-muted-foreground mt-1">Scheduled court appearances</p>
              </div>

              <div className="bg-white dark:bg-card rounded-xl border border-blue-200 dark:border-sky-500/30 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 dark:text-muted-foreground">Outstanding</p>
                  <BarChart3 className="h-4 w-4 text-blue-600 dark:text-sky-400" />
                </div>
                <p className="text-xl font-bold text-gray-900 dark:text-foreground mt-2">{formatMoney(billing.totalOutstanding)}</p>
                <p className="text-xs text-gray-500 dark:text-muted-foreground mt-1">Uncollected invoice amount</p>
              </div>

              <div className="bg-white dark:bg-card rounded-xl border border-rose-200 dark:border-rose-500/30 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 dark:text-muted-foreground">Failed Txn (30d)</p>
                  <Activity className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-foreground mt-2">{analytics.recentFailedTransactions}</p>
                <p className="text-xs text-gray-500 dark:text-muted-foreground mt-1">Recent payment failures</p>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-border shadow-sm">
                <div className="p-4 border-b border-gray-100 dark:border-border flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground">Recent Activity</h3>
                    <p className="text-sm text-muted-foreground">Latest case, task, invoice, and billing events</p>
                  </div>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-border">
                  {activityFeed.length > 0 ? (
                    activityFeed.slice(0, 8).map((item: any, index: number) => (
                      <div
                        key={`${item.type}-${index}`}
                        className="p-4 hover:bg-gray-50 dark:hover:bg-muted transition-colors cursor-pointer"
                        onClick={() => item.href && router.push(item.href)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-foreground truncate">{item.title}</p>
                            <p className="text-xs text-gray-500 dark:text-muted-foreground truncate mt-0.5">{item.subtitle}</p>
                          </div>
                          <span className="text-[11px] text-gray-400 dark:text-muted-foreground whitespace-nowrap">
                            {item.at ? new Date(item.at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-sm text-gray-500 dark:text-muted-foreground">No recent activity yet</div>
                  )}
                </div>
              </div>

              <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-border shadow-sm">
                <div className="p-4 border-b border-gray-100 dark:border-border">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground">Operations & Billing Health</h3>
                  <p className="text-sm text-muted-foreground">Automation runs and billing support signals</p>
                </div>
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded-lg border dark:border-border bg-gray-50 dark:bg-muted">
                      <p className="text-xs text-gray-500 dark:text-muted-foreground">Automation</p>
                      <p className="font-semibold text-gray-900 dark:text-foreground">
                        {operations.automationEnabled ? "Enabled" : "Upgrade required"}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border dark:border-border bg-gray-50 dark:bg-muted">
                      <p className="text-xs text-gray-500 dark:text-muted-foreground">Open Billing Issues</p>
                      <p className="font-semibold text-gray-900 dark:text-foreground">{billing.openBillingIssues}</p>
                    </div>
                    <div className="p-3 rounded-lg border dark:border-border bg-gray-50 dark:bg-muted">
                      <p className="text-xs text-gray-500 dark:text-muted-foreground">Collected This Month</p>
                      <p className="font-semibold text-gray-900 dark:text-foreground">{formatMoney(billing.collectedThisMonth)}</p>
                    </div>
                    <div className="p-3 rounded-lg border dark:border-border bg-gray-50 dark:bg-muted">
                      <p className="text-xs text-gray-500 dark:text-muted-foreground">Overdue Amount</p>
                      <p className="font-semibold text-gray-900 dark:text-foreground">{formatMoney(billing.overdueOutstanding)}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-muted-foreground mb-2">Recent Jobs</p>
                    <div className="space-y-2">
                      {(operations.recentJobs || []).slice(0, 4).map((job: any) => (
                        <div key={job.id} className="flex items-center justify-between text-sm p-2 rounded-md bg-gray-50 dark:bg-muted border dark:border-border">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-foreground truncate">{job.jobName}</p>
                            <p className="text-xs text-gray-500 dark:text-muted-foreground">
                              {job.startedAt ? new Date(job.startedAt).toLocaleString("en-IN") : "-"}
                            </p>
                          </div>
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-medium",
                            job.status === "success" ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" :
                            job.status === "failed" ? "bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400" :
                            "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400"
                          )}>
                            {job.status}
                          </span>
                        </div>
                      ))}
                      {(operations.recentJobs || []).length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-muted-foreground">No job runs recorded yet</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid lg:grid-cols-3 gap-6 mb-6">
              {/* Calendar - takes 2 columns, no upcoming events sidebar */}
              <div className="lg:col-span-2 bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-border shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-border">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5 text-sidebar-primary" />
                    Calendar
                  </h3>
                  <p className="text-sm text-muted-foreground">Your scheduled events and hearings</p>
                </div>
                <div className="p-2 md:p-4">
                  <Suspense fallback={
                    <div className="flex items-center justify-center h-80">
                      <LoaderCircle className="animate-spin text-sidebar-primary" size={32} />
                    </div>
                  }>
                    <Calendar embedded />
                  </Suspense>
                </div>
              </div>

              {/* Quick Actions - 1 column */}
              <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-border shadow-sm">
                <div className="p-4 border-b border-gray-100 dark:border-border">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground">Quick Actions</h3>
                  <p className="text-sm text-muted-foreground">Frequently used services</p>
                </div>
                <div className="p-4 flex flex-col gap-3">
                  {quickActions.map((item) => (
                    <button
                      key={item.name}
                      onClick={() => router.push(item.href)}
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-border hover:border-gray-200 dark:hover:border-cyan-500/30 hover:bg-gray-50 dark:hover:bg-muted transition-all duration-200 text-left group cursor-pointer"
                    >
                      <span className={cn("p-2 rounded-lg flex-shrink-0 transition-transform group-hover:scale-105", item.color)}>
                        {item.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 dark:text-foreground">{item.name}</p>
                        <p className="text-xs text-gray-500 dark:text-muted-foreground truncate">{item.description}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-400 dark:text-muted-foreground group-hover:text-gray-600 dark:group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Pending Tasks - Full Width */}
            <div className="mb-6">
              <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-border shadow-sm">
                <div className="p-4 border-b border-gray-100 dark:border-border flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground flex items-center gap-2">
                      <CheckSquare className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      Pending Tasks
                    </h3>
                    <p className="text-sm text-muted-foreground">Tasks requiring your attention</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => router.push("/tasks")} className="text-sidebar-primary hover:text-sidebar-primary/80">
                    View All <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
                <div className="p-4">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <LoaderCircle className="animate-spin text-gray-400 dark:text-muted-foreground" size={24} />
                    </div>
                  ) : data?.recentTasks && data.recentTasks.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {data.recentTasks.slice(0, 6).map((task: any, i: number) => (
                        <div key={task._id || i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-muted hover:bg-gray-100 dark:hover:bg-muted/80 transition-colors">
                          <div className={cn(
                            "w-2 h-2 rounded-full flex-shrink-0",
                            task.dueDate && new Date(task.dueDate) < new Date() ? "bg-red-500" : "bg-orange-400"
                          )} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-gray-900 dark:text-foreground truncate">{task.task}</p>
                            <p className="text-xs text-gray-500 dark:text-muted-foreground mt-0.5">
                              Due: {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date'}
                            </p>
                          </div>
                          {task.dueDate && new Date(task.dueDate) < new Date() && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-medium">Overdue</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <CheckSquare className="h-10 w-10 text-gray-300 dark:text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm font-medium text-gray-600 dark:text-muted-foreground">No pending tasks</p>
                      <p className="text-xs text-gray-400 dark:text-muted-foreground mt-1">You&apos;re all caught up!</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => router.push("/tasks")}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Create Task
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Recent Clients & Cases */}
            {!loading && (data?.recentCases?.length || data?.recentClients?.length) ? (
              <div className="grid lg:grid-cols-2 gap-6 mt-6">
                {data?.recentCases && data.recentCases.length > 0 && (
                  <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-border shadow-sm">
                    <div className="p-4 border-b border-gray-100 dark:border-border flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground flex items-center gap-2">
                        <Briefcase className="h-5 w-5 text-blue-600 dark:text-sky-400" />
                        Recent Cases
                      </h3>
                      <Button variant="ghost" size="sm" onClick={() => router.push("/case-tracking")} className="text-sidebar-primary hover:text-sidebar-primary/80">
                        View All <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-border">
                      {data.recentCases.slice(0, 4).map((c: any, i: number) => (
                        <div key={c._id || i} className="p-4 hover:bg-gray-50 dark:hover:bg-muted transition-colors cursor-pointer" onClick={() => router.push(`/case-tracking/view/${c._id}`)}>
                          <p className="font-medium text-sm text-gray-900 dark:text-foreground truncate">{c.caseTitle || c.caseNo}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-gray-500 dark:text-muted-foreground">{c.caseNo}</span>
                            <span className="text-xs text-gray-400 dark:text-muted-foreground">|</span>
                            <span className="text-xs text-gray-500 dark:text-muted-foreground">{c.courtName || 'N/A'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {data?.recentClients && data.recentClients.length > 0 && (
                  <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-border shadow-sm">
                    <div className="p-4 border-b border-gray-100 dark:border-border flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground flex items-center gap-2">
                        <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        Recent Clients
                      </h3>
                      <Button variant="ghost" size="sm" onClick={() => router.push("/my-clients")} className="text-sidebar-primary hover:text-sidebar-primary/80">
                        View All <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-border">
                      {data.recentClients.slice(0, 4).map((client: any, i: number) => (
                        <div key={client._id || i} className="p-4 hover:bg-gray-50 dark:hover:bg-muted transition-colors cursor-pointer flex items-center gap-3" onClick={() => router.push(`/my-clients/view/${client._id}`)}>
                          <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                              {(client.name || 'U')[0].toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-gray-900 dark:text-foreground truncate">{client.name}</p>
                            <p className="text-xs text-gray-500 dark:text-muted-foreground">{client.email || client.contact || 'No contact info'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
            </div>
            {/* End of Desktop Layout */}

          </div>
        </div>
      </div>
    </div>
  )
}
export default Dashboard