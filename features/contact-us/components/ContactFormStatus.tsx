import { AlertCircle, CheckCircle } from "lucide-react"
import type { ContactStatus } from "../types"

export function ContactFormStatus({ status }: { status: ContactStatus }) {
  if (status === "success") {
    return (
      <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl mb-6">
        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-green-800">Message sent successfully!</p>
          <p className="text-xs text-green-600">We&apos;ll get back to you within 24 hours.</p>
        </div>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mb-6">
        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-red-800">Failed to send message</p>
          <p className="text-xs text-red-600">Please try again or email us directly.</p>
        </div>
      </div>
    )
  }

  return null
}
