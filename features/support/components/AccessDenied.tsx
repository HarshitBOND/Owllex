import { ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"

export function AccessDenied({ onBackToDashboard }: { onBackToDashboard: () => void }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <div className="bg-white border border-red-200 rounded-xl p-8 text-center">
        <ShieldAlert className="h-10 w-10 text-red-500 mx-auto mb-3" />
        <h2 className="text-xl font-semibold text-gray-900">Access denied</h2>
        <p className="text-sm text-gray-500 mt-1">Support team role is required to open this panel.</p>
        <Button className="mt-5" onClick={onBackToDashboard}>Back to Dashboard</Button>
      </div>
    </div>
  )
}
