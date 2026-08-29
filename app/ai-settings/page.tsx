import { ComingSoonPage } from "@/components/layout/coming-soon-page"
import { Settings2 } from "lucide-react"

export default function Page() {
  return (
    <ComingSoonPage
      title="AI Settings"
      description="Choose your default model, tone, and jurisdiction preferences for the AI assistant."
      icon={Settings2}
    />
  )
}
