import { Loader2 } from "lucide-react"

export default function AdminDashboardLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#F3F5F9] dark:bg-gray-950">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-10 h-10 text-sidebar-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading admin panel...</p>
      </div>
    </div>
  )
}
