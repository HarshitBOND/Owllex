import { ComingSoonPage } from "@/components/layout/coming-soon-page"
import { Quote } from "lucide-react"

export default function Page() {
  return (
    <ComingSoonPage
      title="Citations Checker"
      description="Verify that every citation in a filing is correctly formatted, still good law, and actually supports the point."
      icon={Quote}
    />
  )
}
