import Link from "next/link"
import { FileQuestion } from "lucide-react"

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-14 h-14 mx-auto mb-6 flex items-center justify-center rounded-2xl bg-muted">
          <FileQuestion className="w-7 h-7 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground mb-2">404</p>
        <h1 className="font-serif text-2xl font-medium text-foreground mb-2">Page not found</h1>
        <p className="text-sm text-muted-foreground mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Go to dashboard
          </Link>
          <Link
            href="/"
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Back home
          </Link>
        </div>
      </div>
    </div>
  )
}
