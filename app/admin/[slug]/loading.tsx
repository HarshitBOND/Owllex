export default function AdminLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#F3F5F9] dark:bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Loading admin panel...</p>
      </div>
    </div>
  )
}
