import { Users, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface RecentClientsCardProps {
  clients: any[]
  limit: number
  compact?: boolean
  showViewAll?: boolean
  onNavigate: (href: string) => void
}

export function RecentClientsCard({ clients, limit, compact, showViewAll, onNavigate }: RecentClientsCardProps) {
  return (
    <div className="bg-white dark:bg-card rounded-lg lg:rounded-xl border border-gray-200 dark:border-border shadow-sm">
      <div className={compact ? "p-3 border-b border-gray-100 dark:border-border" : "p-4 border-b border-gray-100 dark:border-border flex items-center justify-between"}>
        <h3 className={compact ? "text-sm font-semibold text-gray-900 dark:text-foreground flex items-center gap-2" : "text-lg font-semibold text-gray-900 dark:text-foreground flex items-center gap-2"}>
          <Users className={compact ? "h-4 w-4 text-emerald-600 dark:text-emerald-400" : "h-5 w-5 text-emerald-600 dark:text-emerald-400"} />
          Recent Clients
        </h3>
        {showViewAll && (
          <Button variant="ghost" size="sm" onClick={() => onNavigate("/my-clients")} className="text-sidebar-primary hover:text-sidebar-primary/80">
            View All <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </div>
      <div className="divide-y divide-gray-100 dark:divide-border">
        {clients.slice(0, limit).map((client: any, i: number) => (
          <div
            key={client._id || i}
            className={compact ? "p-3 flex items-center gap-2" : "p-4 hover:bg-gray-50 dark:hover:bg-muted transition-colors cursor-pointer flex items-center gap-3"}
            onClick={() => onNavigate(`/my-clients/view/${client._id}`)}
          >
            <div className={cn(compact ? "w-7 h-7" : "w-9 h-9", "rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center flex-shrink-0")}>
              <span className={cn(compact ? "text-xs" : "text-sm", "font-semibold text-emerald-700 dark:text-emerald-400")}>
                {(client.name || "U")[0].toUpperCase()}
              </span>
            </div>
            <div className={compact ? "min-w-0" : "flex-1 min-w-0"}>
              <p className={cn(compact ? "text-xs" : "font-medium text-sm", "font-medium text-gray-900 dark:text-foreground truncate")}>{client.name}</p>
              <p className={cn(compact ? "text-[10px]" : "text-xs", "text-gray-500 dark:text-muted-foreground truncate")}>{client.email || client.contact || "No contact"}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

