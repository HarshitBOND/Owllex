import { ComingSoonPage } from "@/components/layout/coming-soon-page"
import { Search } from "lucide-react"

export default function Page() {
  return (
    <ComingSoonPage
      title="Legal Research"
      description="Ask natural-language legal questions and get sourced answers pulled from statutes, case law, and commentary."
      icon={Search}
    />
  )
}
