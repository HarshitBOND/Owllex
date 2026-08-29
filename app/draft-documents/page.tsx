import { ComingSoonPage } from "@/components/layout/coming-soon-page"
import { FileEdit } from "lucide-react"

export default function Page() {
  return (
    <ComingSoonPage
      title="Draft Documents"
      description="Generate first drafts of notices, petitions, and agreements from a short brief, ready for your review."
      icon={FileEdit}
    />
  )
}
