export const accentStyles: Record<string, { color: string; bgColor: string }> = {
  teal: { color: "text-teal-700 dark:text-teal-400", bgColor: "bg-teal-50 dark:bg-teal-500/10" },
  indigo: { color: "text-indigo-700 dark:text-indigo-400", bgColor: "bg-indigo-50 dark:bg-indigo-500/10" },
  amber: { color: "text-amber-700 dark:text-amber-400", bgColor: "bg-amber-50 dark:bg-amber-500/10" },
  violet: { color: "text-violet-700 dark:text-violet-400", bgColor: "bg-violet-50 dark:bg-violet-500/10" },
  rose: { color: "text-rose-700 dark:text-rose-400", bgColor: "bg-rose-50 dark:bg-rose-500/10" },
  emerald: { color: "text-emerald-700 dark:text-emerald-400", bgColor: "bg-emerald-50 dark:bg-emerald-500/10" },
}

export const accentFor = (key: string) => accentStyles[key] ?? accentStyles.teal

export const statusStyles: Record<string, { label: string; color: string; bgColor: string }> = {
  pending: { label: "Queued", color: "text-gray-600 dark:text-gray-400", bgColor: "bg-gray-100 dark:bg-gray-500/10" },
  indexing: { label: "Indexing", color: "text-amber-700 dark:text-amber-400", bgColor: "bg-amber-50 dark:bg-amber-500/10" },
  ready: { label: "Indexed", color: "text-emerald-700 dark:text-emerald-400", bgColor: "bg-emerald-50 dark:bg-emerald-500/10" },
  failed: { label: "Not indexed", color: "text-rose-700 dark:text-rose-400", bgColor: "bg-rose-50 dark:bg-rose-500/10" },
}

export const formatSize = (bytes: number) => {
  if (!bytes) return "0 KB"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
