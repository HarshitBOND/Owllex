import { Suspense } from "react"
import dynamic from "next/dynamic"
import { Calendar as CalendarIcon, LoaderCircle } from "lucide-react"

const Calendar = dynamic(() => import("@/features/calendar").then((mod) => ({ default: mod.Calendar })), { ssr: false })

export function MobileCalendarSection() {
  return (
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
  )
}
