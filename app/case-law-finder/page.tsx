import { ComingSoonPage } from "@/components/layout/coming-soon-page"
import { Gavel } from "lucide-react"

export default function Page() {
  return (
    <ComingSoonPage
      title="Case Law Finder"
      description="Search precedent and prior judgments relevant to your matter, ranked by jurisdiction and relevance."
      icon={Gavel}
    />
  )
}
