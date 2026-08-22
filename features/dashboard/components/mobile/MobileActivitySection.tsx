import type { DashboardData } from "../../types"
import { ActivityFeed } from "../ActivityFeed"
import { RecentCasesCard } from "../RecentCasesCard"
import { RecentClientsCard } from "../RecentClientsCard"

interface MobileActivitySectionProps {
  activityFeed: any[]
  data: DashboardData | null
  onNavigate: (href: string) => void
}

export function MobileActivitySection({ activityFeed, data, onNavigate }: MobileActivitySectionProps) {
  return (
    <>
      <div className="bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border shadow-sm mb-4">
        <div className="p-3 border-b border-gray-100 dark:border-border">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-foreground">Recent Activity</h3>
        </div>
        <ActivityFeed activityFeed={activityFeed} limit={8} compact onNavigate={onNavigate} />
      </div>

      <div className="space-y-4">
        {data?.recentCases && data.recentCases.length > 0 && (
          <RecentCasesCard cases={data.recentCases} limit={3} compact onNavigate={onNavigate} />
        )}

        {data?.recentClients && data.recentClients.length > 0 && (
          <RecentClientsCard clients={data.recentClients} limit={3} compact onNavigate={onNavigate} />
        )}
      </div>
    </>
  )
}
