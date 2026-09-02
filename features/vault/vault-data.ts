export const verifyStatusStyles: Record<string, { label: string; color: string; bgColor: string }> = {
  unverified: {
    label: "Not yet checked",
    color: "text-gray-600 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-500/10",
  },
  present: {
    label: "Present in storage",
    color: "text-sky-700 dark:text-sky-400",
    bgColor: "bg-sky-50 dark:bg-sky-500/10",
  },
  verified: {
    label: "Integrity verified",
    color: "text-brand-700 dark:text-brand-400",
    bgColor: "bg-brand-50 dark:bg-brand-500/10",
  },
  missing: {
    label: "Missing from storage",
    color: "text-rose-700 dark:text-rose-400",
    bgColor: "bg-rose-50 dark:bg-rose-500/10",
  },
  corrupted: {
    label: "Hash mismatch",
    color: "text-amber-700 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-500/10",
  },
}

export const formatSize = (bytes: number) => {
  if (!bytes) return "0 KB"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
