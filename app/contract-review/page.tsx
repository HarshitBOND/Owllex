import { ComingSoonPage } from "@/components/layout/coming-soon-page"
import { FileCheck2 } from "lucide-react"

export default function Page() {
  return (
    <ComingSoonPage
      title="Contract Review"
      description="Upload a contract to flag risky clauses, missing terms, and deviations from standard language."
      icon={FileCheck2}
    />
  )
}
