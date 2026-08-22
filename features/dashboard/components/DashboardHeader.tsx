import Navbar from "@/components/layout/navbar"
import { cn } from "@/lib/utils"
import type { MobileSection } from "../types"
import { getGreeting, mobileSectionTabs } from "../utils"

interface DashboardHeaderProps {
  firstName: string | null | undefined
  mobileSection: MobileSection
  setMobileSection: (section: MobileSection) => void
}

export function DashboardHeader({ firstName, mobileSection, setMobileSection }: DashboardHeaderProps) {
  return (
    <div className="bg-white dark:bg-card border-b border-gray-200 dark:border-border w-full">
      <div className="max-w-[1400px] w-full mx-auto px-3 sm:px-4 md:px-6 py-3 md:py-4">
        <Navbar location="Dashboard" />
        <div className="mb-2">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-foreground">
            {getGreeting()}, {firstName || "Counselor"} 👋
          </h2>
          <p className="text-xs sm:text-sm md:text-base text-muted-foreground mt-1">
            Here&apos;s an overview of your legal workspace
          </p>
        </div>

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
  )
}
