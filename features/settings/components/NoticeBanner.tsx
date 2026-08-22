import { CheckCircle2, CircleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import type { NoticeState } from "../types"

export function NoticeBanner({ notice }: { notice: NoticeState }) {
  if (!notice) return null

  return (
    <div
      className={cn(
        "mb-4 rounded-md border px-3 py-2 text-sm flex items-center gap-2",
        notice.kind === "success"
          ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
          : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400",
      )}
    >
      {notice.kind === "success" ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <CircleAlert className="h-4 w-4" />
      )}
      {notice.message}
    </div>
  )
}
