import {
  Activity, BarChart3, Briefcase, Calendar as CalendarIcon, CheckSquare,
  Clock, FileSearch, Users,
} from "lucide-react"
import type { DashboardData, QuickActionDefinition, StatCardDefinition } from "./types"

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)
}

export function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return "Good Morning"
  if (hour < 17) return "Good Afternoon"
  return "Good Evening"
}

export function buildStatCards(stats: DashboardData["stats"]): StatCardDefinition[] {
  return [
    {
      name: "Active Cases",
      value: stats.totalCases,
      icon: Briefcase,
      color: "text-blue-600 dark:text-sky-400",
      bgColor: "bg-blue-50 dark:bg-sky-500/10",
      borderColor: "border-blue-200 dark:border-sky-500/30",
      description: "Total cases in your portfolio",
      href: "/case-tracking",
    },
    {
      name: "Total Clients",
      value: stats.totalClients,
      icon: Users,
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-50 dark:bg-emerald-500/10",
      borderColor: "border-emerald-200 dark:border-emerald-500/30",
      description: "Clients under management",
      href: "/my-clients",
    },
    {
      name: "Pending Tasks",
      value: stats.pendingTasks,
      icon: CheckSquare,
      color: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-50 dark:bg-orange-500/10",
      borderColor: "border-orange-200 dark:border-orange-500/30",
      description: "Tasks awaiting completion",
      href: "/tasks",
    },
    {
      name: "Upcoming Hearings",
      value: stats.upcomingHearings,
      icon: Clock,
      color: "text-violet-600 dark:text-violet-400",
      bgColor: "bg-violet-50 dark:bg-violet-500/10",
      borderColor: "border-violet-200 dark:border-violet-500/30",
      description: "Hearings on schedule",
      href: "/case-tracking",
    },
  ]
}

export const quickActions: QuickActionDefinition[] = [
  {
    name: "My Cases",
    description: "Track and manage all your cases",
    icon: FileSearch,
    href: "/case-tracking",
    color: "bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500",
  },
  {
    name: "Add Client",
    description: "Register a new client",
    icon: Users,
    href: "/my-clients/add",
    color: "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500",
  },
  {
    name: "View Invoices",
    description: "Billing and payment tracking",
    icon: BarChart3,
    href: "/invoices",
    color: "bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500",
  },
]

export const mobileSectionTabs = [
  { id: "overview" as const, label: "Overview", icon: Briefcase },
  { id: "calendar" as const, label: "Calendar", icon: CalendarIcon },
  { id: "tasks" as const, label: "Tasks", icon: CheckSquare },
  { id: "activity" as const, label: "Activity", icon: Activity },
]
