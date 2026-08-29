import { ComingSoonPage } from "@/components/layout/coming-soon-page"
import { ClipboardList } from "lucide-react"

export default function Page() {
  return (
    <ComingSoonPage
      title="Legal Forms"
      description="A library of ready-to-use legal form templates you can fill in and export in minutes."
      icon={ClipboardList}
    />
  )
}
