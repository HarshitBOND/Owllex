import { LoaderCircle } from "lucide-react"

export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#F3F5F9] dark:bg-background">
      <div className="flex flex-col items-center gap-3">
        <LoaderCircle className="h-10 w-10 animate-spin text-sidebar-primary" />
        <p className="text-sm text-muted-foreground">Loading PDF Scraper...</p>
      </div>
    </div>
  )
}
