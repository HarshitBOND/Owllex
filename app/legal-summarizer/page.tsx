import { ComingSoonPage } from "@/components/layout/coming-soon-page"
import { FileText } from "lucide-react"

export default function Page() {
  return (
    <ComingSoonPage
      title="Legal Summarizer"
      description="Turn long judgments, filings, or contracts into a concise summary of the key points and obligations."
      icon={FileText}
    />
  )
}
