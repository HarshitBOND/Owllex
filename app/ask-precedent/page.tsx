import { ComingSoonPage } from "@/components/layout/coming-soon-page"
import { MessageCircleQuestion } from "lucide-react"

export default function Page() {
  return (
    <ComingSoonPage
      title="Ask Precedent"
      description="Pose a fact pattern and get the closest matching precedents with an explanation of how they apply."
      icon={MessageCircleQuestion}
    />
  )
}
